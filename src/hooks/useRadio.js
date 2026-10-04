import { useCallback, useEffect, useRef, useState } from "react";
import { connectRadio, disconnectRadio, isPublished, openMicrophone, publishMicrophoneTrack, unpublishMicrophone, listAudioDevices, waitForPublishPermission } from "../lib/livekit";
import { issueRadioSession, issueRadioPTT } from "../lib/auth";
import {attachVoice} from "../lib/voicefx";
import { config } from "../lib/config";

// Route a member's audio to the chosen speaker (WebView2 supports setSinkId; others keep the default).
export function setSink(el,deviceId){if(el?.setSinkId)el.setSinkId(deviceId||"").catch(()=>{})}

const nameOf=p=>{try{const m=p?.metadata?JSON.parse(p.metadata):{};return m.radioCallsign||m.callsign||m.displayName||p?.name||p?.identity||"Member"}catch{return p?.name||p?.identity||"Member"}};
const LAST_HEARD_MAX=10;
// Re-issue the radio session in the background so the server keeps this connection's
// voice identity alive; LiveKit itself refreshes the room token while connected.
const SESSION_REFRESH_MS=4*60*1000;

// Neither the Base44 SDK nor the PTT calls time out on their own, so a hung server call
// would leave the radio stuck on "Connecting…" or "Requesting…".
const SESSION_TIMEOUT_MS=20000, PTT_TIMEOUT_MS=8000, MIC_TIMEOUT_MS=8000;
const CONNECT_ATTEMPTS=2, RETRY_DELAY_MS=1500;
// After LiveKit gives up on its own reconnect (about a minute), keep trying with fresh
// radio passes for about five minutes before showing an error.
const RECONNECT_DELAYS_MS=[2000,5000,10000,20000,30000,30000,30000,30000,30000,30000,30000];
const PTT_ERROR_MS=5000;
// The server drops a floor claim 30 s after the last renew. Renew every 8 s (as the website
// does) and ride out failed renews until 20 s have passed since the last good one.
const RENEW_MS=8000, RENEW_GRACE_MS=20000, RENEW_RETRY_MS=2000;
// The server answers 409 (no longer the holder) or 403 when the floor is really gone.
const floorGone=err=>[403,409].includes(err?.status);
// Scan and console listeners (this app's and the website's) join with "rn-monitor-"
// identities; they aren't members on the channel.
const isListener=p=>String(p?.identity||"").startsWith("rn-monitor-");
// LiveKit DisconnectReason values that must not trigger an automatic reconnect.
const DUPLICATE_IDENTITY=2, PARTICIPANT_REMOVED=4;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function withTimeout(promise,ms,message){
  let t;
  return Promise.race([promise,new Promise((_,reject)=>{t=setTimeout(()=>reject(Object.assign(new Error(message),{timedOut:true})),ms)})]).finally(()=>clearTimeout(t));
}
// livekit-client ConnectionErrorReason: 0 NotAllowed, 1 ServerUnreachable, 5 Timeout, 6 WebSocket.
const retryable=err=>!!err&&!err.noRetry&&err.reason!==0&&([1,5,6].includes(err.reason)||/timed out|failed to fetch|websocket error/i.test(err.message||""));
const hostOf=url=>{try{return new URL(url).host}catch{return url||"the voice server"}};
// Plain-language connect errors; the raw LiveKit text stays in errorDetail.
export function connectMessage(err,url){
  const raw=err?.message||"",host=hostOf(url);
  if(err?.noRetry)return raw||"Could not start radio session.";
  if(err?.reason===5||/timed out/i.test(raw))return `Voice server ${host} didn't answer. Press power to try again.`;
  if(err?.reason===0)return `Voice server ${host} refused the radio pass${err.status?" ("+err.status+")":""}.`;
  if(/pc connection|could not establish (publisher|subscriber)/i.test(raw))return `Reached ${host}, but the audio path failed (a firewall may be blocking it).`;
  if(err?.reason===1||err?.reason===6||/failed to fetch|websocket/i.test(raw))return `Can't reach voice server ${host}. Check the internet connection.`;
  return raw||"Unable to connect to radio.";
}

// events: {onTalkStart(entry), onTalkEnd(entry)} for tones and announcements,
// onRecorded({...item, blob}) for each recorded transmission heard, onOwnTalkStart(micTrack).
export function useRadio(channelId, channelInfo=null, outputDeviceId="", volume=1, events={}) {
  const roomRef=useRef(null), micRef=useRef(null), floorRef=useRef(false), renewRef=useRef(null), audioElsRef=useRef(new Map()), pttRequestRef=useRef(0), pttInFlightRef=useRef(false);
  const [state,setState]=useState("ready"),[error,setError]=useState(""),[session,setSession]=useState(null),[participants,setParticipants]=useState([]),[muted,setMuted]=useState(false),[devices,setDevices]=useState([]);
  // connect() hands attachAudio to LiveKit once, so read mute through a ref to stay current.
  const mutedRef=useRef(muted);mutedRef.current=muted;
  const outputRef=useRef(outputDeviceId);outputRef.current=outputDeviceId;
  const volumeRef=useRef(volume);volumeRef.current=volume;
  const eventsRef=useRef(events);eventsRef.current=events;
  const chanRef=useRef(null);chanRef.current={channelId,channel:channelInfo?.name||"",zone:channelInfo?.zoneName||""};
  const pttTargetRef=useRef(null);pttTargetRef.current={zoneId:channelInfo?.zoneId||"",number:channelInfo?.number??null};
  // This connection's voice identity from the radio pass; PTT calls name it.
  const radioIdRef=useRef({sessionId:"",callsign:""});
  const [quality,setQuality]=useState("unknown"),[onAir,setOnAir]=useState(null),[lastHeard,setLastHeard]=useState([]);
  const [errorDetail,setErrorDetail]=useState(""),[connectNote,setConnectNote]=useState(""),[lastUrl,setLastUrl]=useState("");
  const refresh=useCallback(()=>{const room=roomRef.current;if(room)setParticipants(Array.from(room.remoteParticipants.values()).filter(p=>!isListener(p)))},[]);
  const refreshDevices=useCallback(async()=>{try{setDevices(await listAudioDevices())}catch{}},[]);
  const attachAudio=useCallback((track,participant)=>{
    if(track.kind!=="audio")return;
    const existing=audioElsRef.current.get(participant.identity);
    if(existing){try{existing.remove()}catch{}}
    const el=attachVoice(track);el.autoplay=true;el.playsInline=true;el.style.display="none";el.volume=mutedRef.current?0:volumeRef.current;setSink(el,outputRef.current);document.body.appendChild(el);audioElsRef.current.set(participant.identity,el);
    el.play().catch(()=>{});
  },[]);
  const cleanupAudio=useCallback(()=>{for(const el of audioElsRef.current.values()){try{el.remove()}catch{}}audioElsRef.current.clear()},[]);
  // A mic plugged in or out: close the idle open mic, so the next PTT opens the chosen one
  // again instead of keeping a stand-in picked while it was missing.
  const devChangeRef=useRef(null);
  useEffect(()=>{
    refreshDevices();
    const md=navigator.mediaDevices;if(!md?.addEventListener)return;
    const changed=()=>{refreshDevices();devChangeRef.current?.()};
    md.addEventListener("devicechange",changed);return()=>md.removeEventListener("devicechange",changed);
  },[refreshDevices]);
  useEffect(()=>{for(const el of audioElsRef.current.values())setSink(el,outputDeviceId)},[outputDeviceId]);

  // A remote transmission is a member's mic track being published (or unmuted) while
  // they hold the floor. Each one is timed, logged as "last heard" and recorded for
  // instant replay where the WebView supports MediaRecorder.
  const onAirRef=useRef(new Map());
  const txStart=useCallback((track,participant)=>{
    if(!track||track.kind!=="audio"||onAirRef.current.has(participant.identity))return;
    const entry={identity:participant.identity,name:nameOf(participant),start:Date.now(),chunks:[],where:chanRef.current};
    if(typeof MediaRecorder!=="undefined"&&track.mediaStreamTrack){
      try{const rec=new MediaRecorder(new MediaStream([track.mediaStreamTrack]));rec.ondataavailable=e=>{if(e.data?.size)entry.chunks.push(e.data)};rec.start();entry.rec=rec}catch{}
    }
    onAirRef.current.set(participant.identity,entry);
    setOnAir({identity:entry.identity,name:entry.name});
    eventsRef.current.onTalkStart?.(entry);
  },[]);
  const txEnd=useCallback(participant=>{
    const entry=onAirRef.current.get(participant?.identity);if(!entry)return;
    onAirRef.current.delete(entry.identity);
    entry.ms=Date.now()-entry.start;
    const finish=()=>{
      const blob=entry.chunks.length?new Blob(entry.chunks,{type:entry.rec?.mimeType||"audio/webm"}):null;
      const url=blob?URL.createObjectURL(blob):null;
      const item={id:entry.start+":"+entry.identity,identity:entry.identity,name:entry.name,at:entry.start,ms:entry.ms,url};
      if(blob)eventsRef.current.onRecorded?.({...item,...entry.where,blob});
      setLastHeard(list=>{const next=[item,...list.filter(x=>x.id!==item.id)];for(const old of next.slice(LAST_HEARD_MAX))if(old.url)URL.revokeObjectURL(old.url);return next.slice(0,LAST_HEARD_MAX)});
    };
    if(entry.rec&&entry.rec.state!=="inactive"){entry.rec.onstop=finish;try{entry.rec.stop()}catch{finish()}}else finish();
    const next=[...onAirRef.current.values()].pop();
    setOnAir(next?{identity:next.identity,name:next.name}:null);
    eventsRef.current.onTalkEnd?.(entry);
  },[]);
  const clearOnAir=useCallback(()=>{for(const e of onAirRef.current.values()){try{e.rec?.stop()}catch{}}onAirRef.current.clear();setOnAir(null)},[]);
  const replayRef=useRef(null);
  const replay=useCallback((id)=>{
    const item=id?lastHeard.find(x=>x.id===id):lastHeard.find(x=>x.url);
    if(!item?.url)return false;
    try{replayRef.current?.pause()}catch{}
    const a=new Audio(item.url);a.volume=volumeRef.current;setSink(a,outputRef.current);replayRef.current=a;a.play().catch(()=>{});
    return true;
  },[lastHeard]);

  // PTT problems (busy, denied, mic) are shown for a few seconds, then cleared, so an old
  // "Channel is busy" doesn't sit over the radio's screen for the rest of the session.
  const pttErrTimer=useRef(null);
  const setPttError=useCallback(msg=>{
    setError(msg);clearTimeout(pttErrTimer.current);
    pttErrTimer.current=setTimeout(()=>setError(e=>e===msg?"":e),PTT_ERROR_MS);
  },[]);
  useEffect(()=>()=>clearTimeout(pttErrTimer.current),[]);

  // Set once a floor request goes out, so releasing (and every channel switch) only
  // calls the server when there is actually something to release.
  const floorAskedRef=useRef(false);
  // The published microphone: {track, deviceId, room}. Muted while not transmitting.
  const pubRef=useRef(null);
  const dropPublished=useCallback(async()=>{
    const pub=pubRef.current;pubRef.current=null;
    if(!pub)return;
    await unpublishMicrophone(pub.room,pub.track);
    try{pub.track.stop()}catch{}
  },[]);
  devChangeRef.current=()=>{if(!floorAskedRef.current&&pubRef.current)dropPublished()};
  // Every radio-ptt call goes through one queue, so a release always reaches the server
  // after the request it ends and before the next one. Otherwise a late release from a
  // quick re-key could delete the new floor claim and make the server answer "busy".
  const pttChainRef=useRef(Promise.resolve());
  const callPTT=useCallback((action)=>{
    const {zoneId,number}=pttTargetRef.current,{sessionId,callsign}=radioIdRef.current,prev=pttChainRef.current;
    const run=prev.then(()=>issueRadioPTT(channelId,action,zoneId,number,sessionId,callsign));
    // The next call waits for this one, but not past PTT_TIMEOUT_MS: a call nobody answers
    // must not hold up the release or renew behind it.
    pttChainRef.current=prev.then(()=>withTimeout(run,PTT_TIMEOUT_MS,"")).catch(()=>{});
    return run;
  },[channelId]);
  const callPTTRef=useRef(callPTT);callPTTRef.current=callPTT;
  const releasePTT=useCallback(async()=>{
    pttRequestRef.current++;
    const asked=floorAskedRef.current;floorAskedRef.current=false;
    floorRef.current=false;
    if(renewRef.current)clearInterval(renewRef.current);
    renewRef.current=null;
    // Queue the release first: if the request is still in flight, it lands right after
    // it, so a floor granted after key-up is handed straight back.
    const released=asked?callPTT("release").catch(err=>{
      // A release lost to a network blip leaves the channel held for everyone else until
      // the server's 30 s limit. Try once more, unless PTT has been pressed again since.
      if(err?.status!=null)return;
      const gen=pttRequestRef.current;
      setTimeout(()=>{if(gen===pttRequestRef.current&&!floorAskedRef.current)callPTT("release").catch(()=>{})},2000);
    }):null;
    // Keep the mic open, so the next PTT only republishes it instead of reopening the
    // device (and, on Bluetooth headsets, switching audio profiles) every time.
    micRef.current=null;
    const pub=pubRef.current;
    if(pub){
      try{pub.track.mediaStreamTrack.enabled=false}catch{}
      try{await pub.track.mute()}catch{}
      // Unpublish too, so every listener gets the end of the transmission at once
      // (the next PTT republishes the open mic).
      try{await unpublishMicrophone(pub.room,pub.track)}catch{}
    }
    await released;
    if(roomRef.current)setState(s=>s==="reconnecting"?s:"listening");
  },[callPTT]);
  const releasePTTRef=useRef(releasePTT);releasePTTRef.current=releasePTT;
  // End a transmission the server no longer backs, and tell the app so PTT stops showing as keyed.
  const grantAtRef=useRef(0);
  const floorLost=useCallback(async msg=>{
    if(!floorRef.current)return;
    const released=releasePTTRef.current(),gen=pttRequestRef.current;
    await released;
    // PTT pressed again while the release went out: that new press is not lost.
    if(gen!==pttRequestRef.current)return;
    setPttError(msg);
    eventsRef.current.onFloorLost?.();
  },[setPttError]);

  // Each connect/disconnect bumps the generation, so a connect that finishes after the
  // user has already switched channels drops its room instead of taking over.
  const connGenRef=useRef(0);
  const sessionRefreshRef=useRef(null);
  // The Room of a connect still in progress, so a tune, power press or retry can cancel
  // it instead of leaving its signal connection hanging for up to 15 s.
  const pendingRef=useRef(null);
  const cancelPending=useCallback(()=>{const p=pendingRef.current;pendingRef.current=null;if(p)p.disconnect().catch(()=>{})},[]);
  // Whether the user wants the radio on: set by connect, cleared by disconnect. A drop
  // while it is set is unexpected and starts the automatic reconnect.
  const wantOnRef=useRef(false),reconnectRef=useRef({timer:null,tries:0}),connectRef=useRef(null);
  const stopReconnect=useCallback(()=>{clearTimeout(reconnectRef.current.timer);reconnectRef.current={timer:null,tries:0}},[]);
  const scheduleReconnect=useCallback(()=>{
    const r=reconnectRef.current;clearTimeout(r.timer);
    if(!wantOnRef.current)return;
    if(r.tries>=RECONNECT_DELAYS_MS.length){
      wantOnRef.current=false;setConnectNote("");
      setError("Lost the connection to the voice server. Press power to try again.");setState("error");return;
    }
    const delay=RECONNECT_DELAYS_MS[r.tries++];
    setState("reconnecting");setConnectNote("Connection lost, trying again");
    const attempt=async()=>{
      if(!wantOnRef.current)return;
      // No point trying while Windows reports no network; the "online" event retries.
      if(typeof navigator!=="undefined"&&navigator.onLine===false){setConnectNote("Waiting for the network");return}
      try{await connectRef.current({auto:true});reconnectRef.current.tries=0}catch{if(wantOnRef.current)scheduleReconnect()}
    };
    r.timer=setTimeout(attempt,delay);
  },[]);
  useEffect(()=>{
    // Network back, or the window shown again after sleep: retry a pending reconnect now.
    const online=()=>{if(wantOnRef.current&&!roomRef.current&&!pendingRef.current&&reconnectRef.current.tries){clearTimeout(reconnectRef.current.timer);connectRef.current({auto:true}).then(()=>{reconnectRef.current.tries=0},()=>scheduleReconnect())}};
    const shown=()=>{if(document.visibilityState==="visible")online()};
    // Closing the app: leave the channel and hand back a held floor (best effort).
    const leaving=()=>{wantOnRef.current=false;if(floorAskedRef.current){floorAskedRef.current=false;callPTTRef.current("release").catch(()=>{})}const room=roomRef.current;if(room){try{room.disconnect()}catch{}}};
    window.addEventListener("online",online);window.addEventListener("focus",online);document.addEventListener("visibilitychange",shown);
    window.addEventListener("pagehide",leaving);window.addEventListener("beforeunload",leaving);window.addEventListener("rn-app-exiting",leaving);
    return()=>{window.removeEventListener("online",online);window.removeEventListener("focus",online);document.removeEventListener("visibilitychange",shown);window.removeEventListener("pagehide",leaving);window.removeEventListener("beforeunload",leaving);window.removeEventListener("rn-app-exiting",leaving);stopReconnect();clearInterval(sessionRefreshRef.current)};
  },[scheduleReconnect,stopReconnect]);
  const connect=useCallback(async(opts)=>{
    const auto=opts?.auto===true;
    const gen=++connGenRef.current;
    wantOnRef.current=true;
    if(!auto)stopReconnect();
    cancelPending();
    setError("");setErrorDetail("");if(!auto)setConnectNote("");setState(auto?"reconnecting":"connecting");
    let sessionData=null,url="";
    for(let attempt=1;;attempt++){
      let room=null;
      try {
        if(!sessionData){
          // An automatic reconnect keeps the same voice identity, so the server and other
          // radios see the same connection come back instead of a new one.
          const s=await withTimeout(issueRadioSession(channelId, channelInfo?.zoneId, channelInfo?.number, "radio", auto?radioIdRef.current.sessionId:""),SESSION_TIMEOUT_MS,"The radio server didn't answer. Press power to try again.");
          if(gen!==connGenRef.current)return null;
          if(!s?.ok) throw Object.assign(new Error(s?.error||"Could not start radio session."),{noRetry:true});
          sessionData=s;
        }
        url=sessionData.liveKitUrl||config.livekitUrl;setLastUrl(url);
        room=await connectRadio(sessionData.liveKitToken,url,{
          onTrackSubscribed:(track,pub,participant)=>{attachAudio(track,participant);if(!pub?.isMuted)txStart(track,participant)},
          onTrackUnsubscribed:(_track,_pub,participant)=>txEnd(participant),
          onTrackMuted:(pub,participant)=>{if(pub?.kind==="audio")txEnd(participant)},
          onTrackUnmuted:(pub,participant)=>{if(pub?.track)txStart(pub.track,participant)},
          onParticipantDisconnected:participant=>txEnd(participant),
          onQuality:q=>{if(roomRef.current===room)setQuality(q)},
          onAttributes:()=>{if(roomRef.current===room)refresh()},
          onReconnecting:()=>{
            if(roomRef.current!==room)return;
            // Audio can't flow while LiveKit reconnects, so don't sit on the channel.
            if(floorAskedRef.current){releasePTTRef.current?.();eventsRef.current.onFloorLost?.()}
            setState("reconnecting");
          },
          onReconnected:()=>{if(roomRef.current===room){setState(floorRef.current?"transmitting":"listening");refresh()}},
          // The server takes publish rights back when it ends a floor (a moderator, a lapsed
          // claim, or this account keying up elsewhere). Stop at once instead of talking to nobody.
          onPermissions:perm=>{
            if(roomRef.current!==room||!floorRef.current||perm?.canPublish!==false)return;
            if(Date.now()-grantAtRef.current<1500)return;
            floorLost("Transmission ended: the radio server took the channel back.");
          },
          onDisconnected:reason=>{
            if(roomRef.current!==room)return;
            const held=floorAskedRef.current;
            clearOnAir();setQuality("unknown");if(renewRef.current)clearInterval(renewRef.current);renewRef.current=null;floorRef.current=false;floorAskedRef.current=false;micRef.current=null;pttRequestRef.current++;
            if(pubRef.current?.room===room){try{pubRef.current.track.stop()}catch{}pubRef.current=null}
            cleanupAudio();clearInterval(sessionRefreshRef.current);roomRef.current=null;setSession(null);setParticipants([]);setState("ready");
            // Hand back a floor we were holding, and tell the app so PTT stops showing as keyed.
            if(held){callPTT("release").catch(()=>{});eventsRef.current.onFloorLost?.()}
            if(!wantOnRef.current)return;
            if(reason===DUPLICATE_IDENTITY){wantOnRef.current=false;setError("This account joined this channel from another radio or the website, so this radio was disconnected.");setState("error");return}
            if(reason===PARTICIPANT_REMOVED){wantOnRef.current=false;setError("A channel admin removed this radio from the channel.");setState("error");return}
            scheduleReconnect();
          }},{onRoom:r=>{room=r;pendingRef.current=r}});
        if(pendingRef.current===room)pendingRef.current=null;
        if(gen!==connGenRef.current){await disconnectRadio(room);return null}
        roomRef.current=room;reconnectRef.current.tries=0;radioIdRef.current={sessionId:sessionData?.radioSessionId||"",callsign:sessionData?.radioCallsign||""};setSession(sessionData);setConnectNote("");refresh();setState("listening");
        clearInterval(sessionRefreshRef.current);
        sessionRefreshRef.current=setInterval(async()=>{
          if(roomRef.current!==room)return;
          try{
            const fresh=await withTimeout(issueRadioSession(channelId,channelInfo?.zoneId,channelInfo?.number,"radio",radioIdRef.current.sessionId),SESSION_TIMEOUT_MS,"");
            if(roomRef.current!==room||!fresh?.ok)return;
            // Keep talking as this connection: only adopt the answer when it is the same identity.
            if(!fresh.radioSessionId||fresh.radioSessionId===radioIdRef.current.sessionId){radioIdRef.current={sessionId:fresh.radioSessionId||radioIdRef.current.sessionId,callsign:fresh.radioCallsign||radioIdRef.current.callsign};setSession(fresh)}
          }catch{}
        },SESSION_REFRESH_MS);
        return room;
      } catch(err){
        if(room&&pendingRef.current===room)pendingRef.current=null;
        if(gen!==connGenRef.current)return null;
        if(!auto&&attempt<CONNECT_ATTEMPTS&&retryable(err)){
          // livekit-client never retries a signal timeout itself, so try once more.
          setConnectNote("Voice server slow, retrying…");
          await sleep(RETRY_DELAY_MS);
          if(gen!==connGenRef.current)return null;
          continue;
        }
        console.error("[radio] connect failed",{host:hostOf(url),reason:err?.reason,status:err?.status,message:err?.message});
        setErrorDetail(err?.message||"");
        // The automatic reconnect keeps showing "Reconnecting…" and decides what's next.
        if(auto)throw err;
        wantOnRef.current=false;
        setConnectNote("");setError(connectMessage(err,url));setState("error");throw err;
      }
    }
  },[channelId,channelInfo?.zoneId,channelInfo?.number,refresh,attachAudio,cleanupAudio,txStart,txEnd,clearOnAir,cancelPending,callPTT,stopReconnect,scheduleReconnect,floorLost]);
  connectRef.current=connect;

  useEffect(()=>{for(const el of audioElsRef.current.values())el.volume=muted?0:volume},[muted,volume]);


  useEffect(()=>{
    const room=roomRef.current;if(!room)return;
    const sync=()=>refresh();
    room.on("participantConnected",sync);
    room.on("participantDisconnected",sync);
    room.on("participantMetadataChanged",sync);
    return()=>{room.off("participantConnected",sync);room.off("participantDisconnected",sync);room.off("participantMetadataChanged",sync)}
  },[refresh,state]);

  // Publish the mic once the server's publish grant has arrived; one retry covers a grant
  // that lands just after the first attempt.
  const publishWhenAllowed=useCallback(async(room,track,stale)=>{
    await waitForPublishPermission(room);
    try{return await publishMicrophoneTrack(room,track)}
    catch(err){
      if(stale())throw err;
      await sleep(500);
      if(stale())throw err;
      await waitForPublishPermission(room);
      return publishMicrophoneTrack(room,track);
    }
  },[]);
  const requestPTT=useCallback(async(deviceId="")=>{
    if(floorRef.current)return "granted";
    // A repeated key-down (hardware buttons, touch) while the first request is out must
    // not start a second claim or make the first one stale. A press after key-up still
    // goes ahead: releasePTT has already queued the release behind the old request.
    if(pttInFlightRef.current&&floorAskedRef.current)return "pending";
    const requestId=++pttRequestRef.current;
    setError("");
    if(!roomRef.current||!session){setPttError("Connect to the radio first.");return "error"}
    if(roomRef.current.state!=="connected"){setPttError("Reconnecting to the voice server. Try again in a moment.");return "error"}
    if(!session.canTransmit){setPttError("You are not authorized to transmit on this channel.");return "denied"}
    const stale=()=>requestId!==pttRequestRef.current;
    // A floor granted after key-up needs no release here: releasePTT already queued one
    // behind this request (see callPTT). Sending another could end the next PTT's floor.
    try {
      pttInFlightRef.current=true;
      floorAskedRef.current=true;
      const room=roomRef.current,pub=pubRef.current;
      // The server can leave this radio's turned-down claim behind; releasing it is safe
      // (the server only removes this connection's own claims).
      const deny=r=>{floorAskedRef.current=false;callPTT("release").catch(()=>{});setPttError(r.reason==="busy"?"Channel is busy — someone else is transmitting.":r.reason==="muted"?"You are muted on this channel.":"You are not authorized to transmit.");return r.reason==="busy"?"busy":"denied"};
      const ask=()=>withTimeout(callPTT("request"),PTT_TIMEOUT_MS,"The radio server didn't answer the PTT request.");
      // The server can answer "busy" for a claim it just wrote but can't read back yet.
      // If nobody is on air here and PTT is still held, ask once more before giving up:
      // a real talker still answers busy, a false one is granted.
      const askFloor=async()=>{
        let r=await ask();
        if(r?.ok&&!r.granted&&r.reason==="busy"&&!onAirRef.current.size&&!stale()){await sleep(400);if(!stale())r=await ask()}
        return r;
      };
      let mic;
      if(pub&&pub.room===room&&pub.deviceId===deviceId&&pub.track.mediaStreamTrack?.readyState==="live"){
        // Fast path: the mic is already open. Once the floor is granted, unmute it, and
        // republish it if the server unpublished it when the floor was last released.
        // Keep it silent until the floor is granted.
        try{pub.track.mediaStreamTrack.enabled=false}catch{}
        const result=await askFloor();
        if(stale())return "stale";
        if(!result?.ok)throw new Error(result?.error||"Could not reach the radio server.");
        if(!result.granted)return deny(result);
        try{pub.track.mediaStreamTrack.enabled=true}catch{}
        await pub.track.unmute();
        if(!isPublished(room,pub.track))await publishWhenAllowed(room,pub.track,stale);
        if(stale()){try{await pub.track.mute()}catch{}return "stale"}
        mic=pub.track;
      }else{
        // First PTT on this room or device: open the mic while the floor request is in
        // flight instead of after it, so audio starts as soon as the floor is granted.
        const micPromise=openMicrophone(deviceId);
        micPromise.catch(()=>{});
        const dropMic=()=>micPromise.then(t=>t.stop(),()=>{});
        let result;
        try{result=await askFloor()}catch(err){dropMic();throw err}
        if(stale()){dropMic();return "stale"}
        if(!result?.ok){dropMic();throw new Error(result?.error||"Could not reach the radio server.")}
        if(!result.granted){dropMic();return deny(result)}
        // A microphone that never becomes ready must not leave the floor held.
        let track;
        try{track=await withTimeout(micPromise,MIC_TIMEOUT_MS,"The microphone did not become ready within 8 seconds.")}catch(err){dropMic();throw err}
        // Device names are only visible after the first mic permission, so refresh them now.
        refreshDevices();
        if(stale()){track.stop();return "stale"}
        await dropPublished();
        try{mic=await publishWhenAllowed(room,track,stale)}catch(err){track.stop();throw err}
        pubRef.current={track:mic,deviceId,room};
        if(stale()){try{await mic.mute()}catch{}return "stale"}
      }
      micRef.current=mic;
      floorRef.current=true;grantAtRef.current=Date.now();setError("");setState("transmitting");
      eventsRef.current.onOwnTalkStart?.(mic);
      // Renew the floor every 8 s. A 409/403 means it is gone; anything else (slow server,
      // network blip) is retried until RENEW_GRACE_MS has passed since the last good renew.
      let lastOk=Date.now(),renewing=false;
      const renew=async()=>{
        if(renewing||stale())return;
        renewing=true;
        try{
          for(;;){
            let gone=false;
            try{const r=await withTimeout(callPTT("renew"),PTT_TIMEOUT_MS,"renew timed out");if(r?.ok){lastOk=Date.now();return}gone=r?.ok===false}catch(err){gone=floorGone(err)}
            if(stale())return;
            if(gone||Date.now()-lastOk>=RENEW_GRACE_MS){
              await floorLost(gone?"Transmission ended: the radio server says the channel hold ran out.":"Transmission ended: the radio server stopped answering.");
              return;
            }
            await sleep(RENEW_RETRY_MS);
            if(stale())return;
          }
        }finally{renewing=false}
      };
      renewRef.current=setInterval(renew,RENEW_MS);
      return "granted";
    } catch(err){
      if(stale())return "stale";
      setPttError(err?.message||err?.name||"Microphone access failed.");
      floorRef.current=false;
      // Still held, so nothing has released the floor yet: hand it back now.
      if(floorAskedRef.current){floorAskedRef.current=false;callPTT("release").catch(()=>{})}
      return "error";
    } finally {
      if(requestId===pttRequestRef.current)pttInFlightRef.current=false;
    }
  },[session,callPTT,releasePTT,refreshDevices,dropPublished,setPttError,floorLost,publishWhenAllowed]);

  const disconnect=useCallback(async()=>{
    const gen=++connGenRef.current;
    wantOnRef.current=false;stopReconnect();clearInterval(sessionRefreshRef.current);
    cancelPending();
    setConnectNote("");
    // Take the room now: a connect started while the release below is in flight gets a
    // new room, and this disconnect must not end that one.
    const room=roomRef.current;roomRef.current=null;
    clearOnAir();setQuality("unknown");
    cleanupAudio();
    // Hand the channel back first, but don't let a slow server keep the radio on.
    await Promise.race([releasePTT(),sleep(3000)]);
    await dropPublished();
    await disconnectRadio(room);
    if(gen!==connGenRef.current)return;
    setSession(null);
    setParticipants([]);
    setState("ready");
  },[releasePTT,cleanupAudio,dropPublished,clearOnAir,cancelPending,stopReconnect]);

  return {state,error,errorDetail,connectNote,lastUrl,session,participants,muted,setMuted,devices,refreshDevices,connect,requestPTT,releasePTT,disconnect,room:roomRef.current,quality,onAir,lastHeard,replay};
}
