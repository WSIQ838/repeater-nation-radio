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
const RETRY_MS=5000;
// Changing channel briefly disconnects the radio; keep the listening rooms through that
// (silenced) instead of leaving and rejoining every one of them.
const LEAVE_GRACE_MS=4000;

const nameOf=p=>{try{const m=p?.metadata?JSON.parse(p.metadata):{};return m.callsign||m.displayName||p?.name||p?.identity||"Member"}catch{return p?.name||p?.identity||"Member"}};

export function useScan({enabled,channels,priorityId,volume=1,muted=false,outputDeviceId="",suppress=false,onLock,mode="scan",levels={},mutedIds=[],onRecorded=null}){
  const roomsRef=useRef(new Map()); // channelId -> {room, gen, audio: Map(identity->el), onAir: Map(identity->name)}
  const [active,setActive]=useState(null); // {channelId, name, talker}
  const [nuisance,setNuisance]=useState([]);
  const [status,setStatus]=useState({}); // channelId -> "connecting" | "on" | "error"
  const [activity,setActivity]=useState({}); // channelId -> name of who is talking there
  const lockRef=useRef({channelId:null,until:0}),hangRef=useRef(null);
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

  const drop=useCallback(async id=>{
    const r=roomsRef.current.get(id);if(!r)return;
    roomsRef.current.delete(id);r.gen=-1;r.stopAll?.();
    for(const el of r.audio.values()){try{el.remove()}catch{}}
    setStatus(s=>{const n={...s};delete n[id];return n});
    try{await disconnectRadio(r.room)}catch{}
  },[]);

  const join=useCallback(async c=>{
    const entry={room:null,gen:1,audio:new Map(),onAir:new Map(),tracks:new Map(),recs:new Map()};
    // Each transmission heard here is recorded for the traffic log (when a recorder is set).
    const talk=(participant,on)=>{
      const id=participant.identity;
      if(on){
        entry.onAir.set(id,nameOf(participant));
        const t=entry.tracks.get(id);
        if(settingsRef.current.onRecorded&&t?.mediaStreamTrack&&!entry.recs.has(id))entry.recs.set(id,{r:recordTrack(t.mediaStreamTrack),at:Date.now(),name:nameOf(participant)});
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
    try{
      const session=await issueRadioSession(c.id,c.zoneId,c.number);
      if(!session?.ok)throw new Error(session?.error||"Scan could not join "+c.name);
      if(roomsRef.current.get(c.id)!==entry)return;
      const live=()=>roomsRef.current.get(c.id)===entry;
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
        onDisconnected:()=>{
          if(!live())return;
          // Dropped (token expiry, network): rejoin after a pause while still scanning.
          roomsRef.current.delete(c.id);entry.stopAll();for(const el of entry.audio.values()){try{el.remove()}catch{}}
          setStatus(s=>({...s,[c.id]:"error"}));decide();
          setTimeout(()=>{if(!roomsRef.current.has(c.id)&&settingsRef.current.channels.some(x=>x.id===c.id))join(c)},RETRY_MS);
        },
      });
      if(!live()){await disconnectRadio(room);return}
      entry.room=room;
      setStatus(s=>({...s,[c.id]:"on"}));
    }catch{
      if(roomsRef.current.get(c.id)!==entry)return;
      roomsRef.current.delete(c.id);
      setStatus(s=>({...s,[c.id]:"error"}));
      setTimeout(()=>{if(!roomsRef.current.has(c.id)&&settingsRef.current.channels.some(x=>x.id===c.id))join(c)},RETRY_MS);
    }
  },[decide]);

  // Join and leave scanned channels as scan is turned on/off or the list changes.
  const ids=enabled?channels.map(c=>c.id).join(","):"";
  useEffect(()=>{
    const want=new Set(enabled?channels.map(c=>c.id):[]);
    const leave=()=>{for(const id of [...roomsRef.current.keys()])if(!want.has(id))drop(id)};
    let timer;
    if(enabled){leave();for(const c of channels)if(!roomsRef.current.has(c.id))join(c)}
    else timer=setTimeout(()=>{leave();lockRef.current={channelId:null,until:0};setNuisance([])},LEAVE_GRACE_MS);
    decide();
    return()=>clearTimeout(timer);
  },[ids]);
  useEffect(()=>()=>{for(const id of [...roomsRef.current.keys()])drop(id);clearTimeout(hangRef.current)},[]);
  useEffect(()=>{decide()},[volume,muted,suppress,priorityId,nuisance.join(","),mode,JSON.stringify(levels),mutedIds.join(",")]);
  useEffect(()=>{for(const r of roomsRef.current.values())for(const el of r.audio.values())setSink(el,outputDeviceId)},[outputDeviceId]);

  // Nuisance delete: skip the channel scan is stopped on until scan is turned off.
  const nuisanceDelete=useCallback(()=>{
    const id=lockRef.current.channelId;if(!id)return null;
    lockRef.current={channelId:null,until:0};
    setNuisance(n=>n.includes(id)?n:[...n,id]);
    return settingsRef.current.channels.find(c=>c.id===id)||null;
  },[]);

  return {active,status,activity,nuisance,nuisanceDelete};
}
