import { useCallback, useEffect, useRef, useState } from "react";
import { connectRadio, disconnectRadio } from "../lib/livekit";
import { issueRadioSession } from "../lib/auth";
import { setSink } from "./useRadio";
import { recordTrack } from "../lib/traffic";

// Scan: listen to every channel on the scan list at once (receive only) and play the one
// with activity, like a real radio's scan. The selected channel always wins, the
// priority channel interrupts any other, and after a transmission ends scan stays on
// that channel for a short hang time so the reply is heard too.
// mode "monitor" is the dispatch console: every channel plays at once at its own level
// (levels: channelId -> 0..1, mutedIds: channels turned off), and nothing is suppressed.
export const SCAN_HANG_MS=3000;
export const SCAN_MAX=10;
// Retries back off from 2 s to a minute (with jitter) so a channel that can't be joined
// doesn't call the radio server every few seconds for as long as scan is on.
const RETRY_BASE_MS=2000, RETRY_MAX_MS=60000;
// Channels are joined two at a time, a little apart, and only after the main radio has
// settled, so scan doesn't compete with the main channel's connection.
const JOIN_CONCURRENCY=2, JOIN_SPACING_MS=300, START_DELAY_MS=1500;
// Changing channel or a reconnect briefly turns scan off; keep the listening rooms through
// that (silenced) instead of leaving and rejoining every one of them.
const LEAVE_GRACE_MS=15000;
// LiveKit DisconnectReason: the server removed this listener on purpose.
const DUPLICATE_IDENTITY=2, PARTICIPANT_REMOVED=4;
// Not allowed on that channel, or the channel is gone: retrying won't help. (A 401 can be a
// passing server hiccup; a lapsed sign-in is caught by auth.js and ends the session.)
const permanent=err=>[403,404].includes(err?.status);
// Signed-out answers, rate limits and LiveKit refusing the pass wait the longest.
const slow=err=>err?.status===401||err?.status===429||err?.reason===0;
const backoff=tries=>{const base=Math.min(RETRY_MAX_MS,RETRY_BASE_MS*2**tries);return Math.round(base*(0.75+Math.random()*0.5))};

const nameOf=p=>{try{const m=p?.metadata?JSON.parse(p.metadata):{};return m.callsign||m.displayName||p?.name||p?.identity||"Member"}catch{return p?.name||p?.identity||"Member"}};

export function useScan({enabled,channels,priorityId,volume=1,muted=false,outputDeviceId="",suppress=false,onLock,mode="scan",levels={},mutedIds=[],onRecorded=null}){
  const roomsRef=useRef(new Map()); // channelId -> {room, gen, audio: Map(identity->el), onAir: Map(identity->name)}
  const [active,setActive]=useState(null); // {channelId, name, talker}
  const [nuisance,setNuisance]=useState([]);
  const [status,setStatus]=useState({}); // channelId -> "connecting" | "on" | "error" (retrying) | "failed" (not retrying)
  const [errors,setErrors]=useState({}); // channelId -> why it can't be joined
  const [activity,setActivity]=useState({}); // channelId -> name of who is talking there
  const lockRef=useRef({channelId:null,until:0}),hangRef=useRef(null);
  const retryRef=useRef(new Map()); // channelId -> {timer, tries}
  const queueRef=useRef([]),joiningRef=useRef(0),mountedRef=useRef(true);
  const settingsRef=useRef({});settingsRef.current={enabled,volume,muted,outputDeviceId,suppress,priorityId,channels,nuisance,onLock,mode,levels,mutedIds,onRecorded};

  // Pick which scanned channel is heard and set every scanned member's volume.
  const decide=useCallback(()=>{
    const {enabled,volume,muted,suppress,priorityId,channels,nuisance,onLock,mode,levels,mutedIds}=settingsRef.current;
    const now=Date.now(),busy=[],talking={};
    if(!enabled){
      for(const r of roomsRef.current.values())for(const el of r.audio.values())el.volume=0;
      clearTimeout(hangRef.current);setActive(prev=>prev===null?prev:null);setActivity(prev=>Object.keys(prev).length?{}:prev);onLock?.(null);
      return;
    }
    for(const [id,r] of roomsRef.current)if(r.onAir.size)talking[id]=[...r.onAir.values()].pop();
    setActivity(prev=>JSON.stringify(prev)===JSON.stringify(talking)?prev:talking);
    if(mode==="monitor"){
      for(const [id,r] of roomsRef.current)for(const el of r.audio.values())el.volume=muted||mutedIds.includes(id)?0:(levels[id]??volume);
      lockRef.current={channelId:null,until:0};clearTimeout(hangRef.current);
      setActive(prev=>prev===null?prev:null);onLock?.(null);
      return;
    }
    for(const c of channels){
      const r=roomsRef.current.get(c.id);
      if(r&&r.onAir.size&&!nuisance.includes(c.id))busy.push(c);
    }
    let lock=lockRef.current.channelId;
    const lockBusy=busy.some(c=>c.id===lock);
    if(lock&&!lockBusy&&now>=lockRef.current.until)lock=null;
    const priority=busy.find(c=>c.id===priorityId);
    if(priority)lock=priority.id;
    else if(!lock&&busy.length)lock=busy[0].id;
    if(suppress)lock=null;
    if(lock!==lockRef.current.channelId)lockRef.current={channelId:lock,until:0};
    if(lock&&busy.some(c=>c.id===lock))lockRef.current.until=now+SCAN_HANG_MS;
    for(const [id,r] of roomsRef.current)for(const el of r.audio.values())el.volume=id===lock&&!muted?volume:0;
    const c=channels.find(x=>x.id===lock),r=lock&&roomsRef.current.get(lock);
    const next=c?{channelId:c.id,name:c.name,number:c.number,zoneName:c.zoneName,talker:r?[...r.onAir.values()].pop()||"":""}:null;
    setActive(prev=>JSON.stringify(prev)===JSON.stringify(next)?prev:next);
    onLock?.(next);
    // Re-check when the hang time runs out.
    clearTimeout(hangRef.current);
    if(lock&&!busy.some(x=>x.id===lock))hangRef.current=setTimeout(()=>decide(),Math.max(50,lockRef.current.until-now));
  },[]);

  const setChannelError=useCallback((id,text)=>setErrors(e=>{if((e[id]||"")===(text||""))return e;const n={...e};if(text)n[id]=text;else delete n[id];return n}),[]);
  const wanted=useCallback(id=>{const st=settingsRef.current;return mountedRef.current&&st.enabled&&st.channels.some(x=>x.id===id)},[]);
  const clearRetry=useCallback(id=>{const r=retryRef.current.get(id);if(r)clearTimeout(r.timer)},[]);
  // Stop all pending joins and retries (scan turned off, offline, unmount); joined rooms stay.
  const stopPending=useCallback(()=>{
    for(const r of retryRef.current.values())clearTimeout(r.timer);
    retryRef.current.clear();
    for(const c of queueRef.current)setStatus(s=>{if(s[c.id]!=="connecting")return s;const n={...s};delete n[c.id];return n});
    queueRef.current=[];
  },[]);

  const drop=useCallback(async id=>{
    clearRetry(id);retryRef.current.delete(id);
    queueRef.current=queueRef.current.filter(c=>c.id!==id);
    setStatus(s=>{if(!(id in s))return s;const n={...s};delete n[id];return n});setChannelError(id,"");
    const r=roomsRef.current.get(id);if(!r)return;
    roomsRef.current.delete(id);r.gen=-1;r.stopAll?.();
    for(const el of r.audio.values()){try{el.remove()}catch{}}
    // r.room is set as soon as the room is created, so this also cancels a join still connecting.
    try{await disconnectRadio(r.room)}catch{}
  },[clearRetry,setChannelError]);

  // Joins go through a small queue; enqueueRef breaks the join -> retry -> enqueue cycle.
  const enqueueRef=useRef(null);
  const scheduleRetry=useCallback((c,err)=>{
    const id=c.id;clearRetry(id);
    const text=err?.message||"Can't join";
    if(permanent(err)){retryRef.current.delete(id);setStatus(s=>({...s,[id]:"failed"}));setChannelError(id,text);return}
    const tries=retryRef.current.get(id)?.tries||0;
    const delay=Math.max(slow(err)?RETRY_MAX_MS:0,backoff(tries));
    setStatus(s=>({...s,[id]:"error"}));setChannelError(id,text);
    if(!wanted(id)){retryRef.current.delete(id);return}
    const timer=setTimeout(()=>{
      // Offline: the "online" listener resumes the join.
      if(!wanted(id)||roomsRef.current.has(id)||navigator.onLine===false)return;
      enqueueRef.current?.(c);
    },delay);
    retryRef.current.set(id,{timer,tries:tries+1});
  },[clearRetry,setChannelError,wanted]);

  const join=useCallback(async c=>{
    const entry={room:null,gen:1,audio:new Map(),onAir:new Map(),tracks:new Map(),recs:new Map()};
    // Each transmission heard here is recorded for the traffic log (when a recorder is set).
    const talk=(participant,on)=>{
      const id=participant.identity;
      if(on){
        entry.onAir.set(id,nameOf(participant));
        const t=entry.tracks.get(id);
        if(settingsRef.current.enabled&&settingsRef.current.onRecorded&&t?.mediaStreamTrack&&!entry.recs.has(id))entry.recs.set(id,{r:recordTrack(t.mediaStreamTrack),at:Date.now(),name:nameOf(participant)});
      }else{
        entry.onAir.delete(id);
        const x=entry.recs.get(id);if(!x)return;
        entry.recs.delete(id);const ms=Date.now()-x.at;
        x.r.stop().then(res=>{if(res)settingsRef.current.onRecorded?.({at:x.at,ms,channelId:c.id,channel:c.name,zone:c.zoneName,name:x.name,blob:res.blob})});
      }
    };
    entry.stopAll=()=>{for(const id of [...entry.recs.keys()])talk({identity:id},false)};
    roomsRef.current.set(c.id,entry);
    setStatus(s=>({...s,[c.id]:"connecting"}));
    const live=()=>roomsRef.current.get(c.id)===entry;
    try{
      // "monitor" passes get their own receive-only identity, so a scan room can never
      // knock this account's main radio (or the website) off the same channel.
      const session=await issueRadioSession(c.id,c.zoneId,c.number,"monitor");
      if(!session?.ok)throw new Error(session?.error||"Scan could not join "+c.name);
      if(!live())return;
      const room=await connectRadio(session.liveKitToken,session.liveKitUrl,{
        onTrackSubscribed:(track,pub,participant)=>{
          if(!live()||track.kind!=="audio")return;
          const el=track.attach();el.autoplay=true;el.playsInline=true;el.style.display="none";el.volume=0;
          setSink(el,settingsRef.current.outputDeviceId);document.body.appendChild(el);el.play().catch(()=>{});
          const old=entry.audio.get(participant.identity);if(old){try{old.remove()}catch{}}
          entry.audio.set(participant.identity,el);entry.tracks.set(participant.identity,track);
          if(!pub?.isMuted)talk(participant,true);
          decide();
        },
        onTrackUnsubscribed:(_t,_p,participant)=>{if(!live())return;talk(participant,false);entry.tracks.delete(participant.identity);const el=entry.audio.get(participant.identity);if(el){try{el.remove()}catch{}entry.audio.delete(participant.identity)}decide()},
        onTrackMuted:(pub,participant)=>{if(live()&&pub?.kind==="audio"){talk(participant,false);decide()}},
        onTrackUnmuted:(pub,participant)=>{if(live()&&pub?.kind==="audio"){talk(participant,true);decide()}},
        onParticipantDisconnected:participant=>{if(live()){talk(participant,false);entry.tracks.delete(participant.identity);decide()}},
        onDisconnected:reason=>{
          // A join that fails also ends in Disconnected; the catch below handles that one.
          if(!live()||!entry.connected)return;
          // Dropped (network, server restart): rejoin with backoff while still scanning.
          roomsRef.current.delete(c.id);entry.stopAll();for(const el of entry.audio.values()){try{el.remove()}catch{}}
          decide();
          if(reason===DUPLICATE_IDENTITY||reason===PARTICIPANT_REMOVED){setStatus(s=>({...s,[c.id]:"failed"}));setChannelError(c.id,"Removed from this channel by the radio server");return}
          scheduleRetry(c,new Error("Connection dropped"));
        },
      },{onRoom:r=>{entry.room=r}});
      if(!live()){await disconnectRadio(room);return}
      entry.room=room;entry.connected=true;
      retryRef.current.delete(c.id);
      setStatus(s=>({...s,[c.id]:"on"}));setChannelError(c.id,"");
    }catch(err){
      if(!live())return;
      roomsRef.current.delete(c.id);
      scheduleRetry(c,err);
    }
  },[decide,scheduleRetry,setChannelError]);

  const pump=useCallback(()=>{
    while(joiningRef.current<JOIN_CONCURRENCY&&queueRef.current.length){
      const c=queueRef.current.shift();
      if(!wanted(c.id)||roomsRef.current.has(c.id))continue;
      joiningRef.current++;
      join(c).finally(()=>{joiningRef.current--;setTimeout(()=>pump(),JOIN_SPACING_MS)});
    }
  },[join,wanted]);
  const enqueue=useCallback(c=>{
    if(!wanted(c.id)||roomsRef.current.has(c.id)||queueRef.current.some(x=>x.id===c.id))return;
    clearRetry(c.id);
    queueRef.current.push(c);
    setStatus(s=>s[c.id]==="error"||s[c.id]==="failed"?s:{...s,[c.id]:"connecting"});
    pump();
  },[clearRetry,pump,wanted]);
  enqueueRef.current=enqueue;

  // Join and leave scanned channels as scan is turned on/off or the list changes.
  const ids=enabled?channels.map(c=>c.id).join(","):"";
  useEffect(()=>{
    const want=new Set(enabled?channels.map(c=>c.id):[]);
    const leave=()=>{for(const id of new Set([...roomsRef.current.keys(),...retryRef.current.keys(),...queueRef.current.map(c=>c.id)]))if(!want.has(id))drop(id)};
    let timer;
    if(enabled){
      leave();
      // A fresh start waits for the main radio to settle; channels kept through a short
      // drop (and list edits) join straight away.
      const start=()=>{for(const c of settingsRef.current.channels)if(!roomsRef.current.has(c.id)){clearRetry(c.id);retryRef.current.delete(c.id);enqueue(c)}};
      // Forget "can't join" notes for channels no longer on the list.
      const keep=o=>{const n={};let changed=false;for(const k in o){if(want.has(k))n[k]=o[k];else changed=true}return changed?n:o};
      setStatus(keep);setErrors(keep);
      timer=setTimeout(start,roomsRef.current.size?0:START_DELAY_MS);
    }else{
      // Nothing new joins while scan is off; joined rooms are left after the grace period.
      stopPending();
      timer=setTimeout(()=>{leave();setStatus({});setErrors({});lockRef.current={channelId:null,until:0};setNuisance([])},LEAVE_GRACE_MS);
    }
    decide();
    return()=>clearTimeout(timer);
  },[ids]);
  // Back online: retry every scanned channel that isn't joined, without waiting out the backoff.
  useEffect(()=>{
    const online=()=>{for(const c of settingsRef.current.channels)if(wanted(c.id)&&!roomsRef.current.has(c.id)&&retryRef.current.has(c.id)){clearRetry(c.id);retryRef.current.delete(c.id);enqueue(c)}};
    window.addEventListener("online",online);
    return()=>window.removeEventListener("online",online);
  },[enqueue,wanted,clearRetry]);
  useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;stopPending();for(const id of [...roomsRef.current.keys()])drop(id);clearTimeout(hangRef.current)}},[]);
  useEffect(()=>{decide()},[volume,muted,suppress,priorityId,nuisance.join(","),mode,JSON.stringify(levels),mutedIds.join(",")]);
  useEffect(()=>{for(const r of roomsRef.current.values())for(const el of r.audio.values())setSink(el,outputDeviceId)},[outputDeviceId]);

  // Nuisance delete: skip the channel scan is stopped on until scan is turned off.
  const nuisanceDelete=useCallback(()=>{
    const id=lockRef.current.channelId;if(!id)return null;
    lockRef.current={channelId:null,until:0};
    setNuisance(n=>n.includes(id)?n:[...n,id]);
    return settingsRef.current.channels.find(c=>c.id===id)||null;
  },[]);

  return {active,status,errors,activity,nuisance,nuisanceDelete};
}
