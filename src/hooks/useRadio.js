import { useCallback, useEffect, useRef, useState } from "react";
import { connectRadio, disconnectRadio, isPublished, openMicrophone, publishMicrophoneTrack, unpublishMicrophone, listAudioDevices } from "../lib/livekit";
import { issueRadioSession, issueRadioPTT } from "../lib/auth";

// Route a member's audio to the chosen speaker (WebView2 supports setSinkId; others keep the default).
export function setSink(el,deviceId){if(el?.setSinkId)el.setSinkId(deviceId||"").catch(()=>{})}

const nameOf=p=>{try{const m=p?.metadata?JSON.parse(p.metadata):{};return m.callsign||m.displayName||p?.name||p?.identity||"Member"}catch{return p?.name||p?.identity||"Member"}};
const LAST_HEARD_MAX=10;

// events: {onTalkStart(entry), onTalkEnd(entry)} for tones and announcements,
// onRecorded({...item, blob}) for each recorded transmission heard, onOwnTalkStart(micTrack).
export function useRadio(channelId, channelInfo=null, outputDeviceId="", volume=1, events={}) {
  const roomRef=useRef(null), micRef=useRef(null), floorRef=useRef(false), renewRef=useRef(null), audioElsRef=useRef(new Map()), pttRequestRef=useRef(0);
  const [state,setState]=useState("ready"),[error,setError]=useState(""),[session,setSession]=useState(null),[participants,setParticipants]=useState([]),[muted,setMuted]=useState(false),[devices,setDevices]=useState([]);
  // connect() hands attachAudio to LiveKit once, so read mute through a ref to stay current.
  const mutedRef=useRef(muted);mutedRef.current=muted;
  const outputRef=useRef(outputDeviceId);outputRef.current=outputDeviceId;
  const volumeRef=useRef(volume);volumeRef.current=volume;
  const eventsRef=useRef(events);eventsRef.current=events;
  const chanRef=useRef(null);chanRef.current={channelId,channel:channelInfo?.name||"",zone:channelInfo?.zoneName||""};
  const [quality,setQuality]=useState("unknown"),[onAir,setOnAir]=useState(null),[lastHeard,setLastHeard]=useState([]);
  const refresh=useCallback(()=>{const room=roomRef.current;if(room)setParticipants(Array.from(room.remoteParticipants.values()))},[]);
  const refreshDevices=useCallback(async()=>{try{setDevices(await listAudioDevices())}catch{}},[]);
  const attachAudio=useCallback((track,participant)=>{
    if(track.kind!=="audio")return;
    const existing=audioElsRef.current.get(participant.identity);
    if(existing){try{existing.remove()}catch{}}
    const el=track.attach();el.autoplay=true;el.playsInline=true;el.style.display="none";el.volume=mutedRef.current?0:volumeRef.current;setSink(el,outputRef.current);document.body.appendChild(el);audioElsRef.current.set(participant.identity,el);
    el.play().catch(()=>{});
  },[]);
  const cleanupAudio=useCallback(()=>{for(const el of audioElsRef.current.values()){try{el.remove()}catch{}}audioElsRef.current.clear()},[]);
  useEffect(()=>{
    refreshDevices();
    const md=navigator.mediaDevices;if(!md?.addEventListener)return;
    md.addEventListener("devicechange",refreshDevices);return()=>md.removeEventListener("devicechange",refreshDevices);
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
  const releasePTT=useCallback(async()=>{
    pttRequestRef.current++;
    const asked=floorAskedRef.current;floorAskedRef.current=false;
    floorRef.current=false;
    if(renewRef.current)clearInterval(renewRef.current);
    renewRef.current=null;
    // Keep the mic published but muted, so the next PTT only unmutes it instead of
    // renegotiating a new track with the voice server (and, on Bluetooth headsets,
    // switching audio profiles) every time.
    micRef.current=null;
    const pub=pubRef.current;
    if(pub){
      try{pub.track.mediaStreamTrack.enabled=false}catch{}
      try{await pub.track.mute()}catch{}
      // Unpublish immediately on release so every listener receives
      // LiveKit's TrackUnsubscribed event instead of waiting for the
      // floor lease/realtime polling window to notice the release.
      try{await unpublishMicrophone(pub.room,pub.track)}catch{}
    }
    if(asked){try{await issueRadioPTT(channelId,"release")}catch{}}
    if(roomRef.current)setState("listening");
  },[channelId]);

  // Each connect/disconnect bumps the generation, so a connect that finishes after the
  // user has already switched channels drops its room instead of taking over.
  const connGenRef=useRef(0);
  const connect=useCallback(async()=>{
    const gen=++connGenRef.current;
    setError("");setState("connecting");
    try {
      const sessionData=await issueRadioSession(channelId, channelInfo?.zoneId, channelInfo?.number);
      if(gen!==connGenRef.current)return null;
      if(!sessionData?.ok) throw new Error(sessionData?.error||"Could not start radio session.");
      let room=null;
      room=await connectRadio(sessionData.liveKitToken,sessionData.liveKitUrl,{
        onTrackSubscribed:(track,pub,participant)=>{attachAudio(track,participant);if(!pub?.isMuted)txStart(track,participant)},
        onTrackUnsubscribed:(_track,_pub,participant)=>txEnd(participant),
        onTrackMuted:(pub,participant)=>{if(pub?.kind==="audio")txEnd(participant)},
        onTrackUnmuted:(pub,participant)=>{if(pub?.track)txStart(pub.track,participant)},
        onParticipantDisconnected:participant=>txEnd(participant),
        onQuality:q=>{if(roomRef.current===room)setQuality(q)},
        onAttributes:()=>{if(roomRef.current===room)refresh()},
        onDisconnected:()=>{
          if(roomRef.current!==room)return;
          // Free any server-side floor lease if LiveKit drops unexpectedly.
          if(floorAskedRef.current||floorRef.current)issueRadioPTT(channelId,"release").catch(()=>{});
          floorAskedRef.current=false;
          floorRef.current=false;
          clearOnAir();
          setQuality("unknown");
          if(renewRef.current)clearInterval(renewRef.current);
          renewRef.current=null;
          micRef.current=null;
          if(pubRef.current?.room===room){
            try{pubRef.current.track.stop()}catch{}
            pubRef.current=null;
          }
          cleanupAudio();
          roomRef.current=null;
          setSession(null);
          setParticipants([]);
          setState("ready");
        }});
      if(gen!==connGenRef.current){await disconnectRadio(room);return null}
      roomRef.current=room;setSession(sessionData);refresh();setState("listening");return room;
    } catch(err){if(gen!==connGenRef.current)return null;setError(err instanceof Error?err.message:"Unable to connect to radio.");setState("error");throw err}
  },[channelId,channelInfo?.zoneId,channelInfo?.number,refresh,attachAudio,cleanupAudio,txStart,txEnd,clearOnAir]);

  useEffect(()=>{for(const el of audioElsRef.current.values())el.volume=muted?0:volume},[muted,volume]);


  useEffect(()=>{
    const room=roomRef.current;if(!room)return;
    const sync=()=>refresh();
    room.on("participantConnected",sync);
    room.on("participantDisconnected",sync);
    room.on("participantMetadataChanged",sync);
    return()=>{room.off("participantConnected",sync);room.off("participantDisconnected",sync);room.off("participantMetadataChanged",sync)}
  },[refresh,state]);

  const requestPTT=useCallback(async(deviceId="")=>{
    const requestId=++pttRequestRef.current;
    if(floorRef.current)return "granted";
    if(!roomRef.current||!session){setError("Connect to the radio first.");return "error"}
    if(!session.canTransmit){setError("You are not authorized to transmit on this channel.");return "denied"}
    try {
      floorAskedRef.current=true;
      const room=roomRef.current,pub=pubRef.current;
      const deny=async r=>{
        const reason=r?.reason;
        // A second/duplicate floor request can be rejected while an older
        // microphone publication is still live. Never leave that track
        // transmitting after the UI has been told that PTT was denied.
        floorRef.current=false;
        floorAskedRef.current=false;
        if(renewRef.current)clearInterval(renewRef.current);
        renewRef.current=null;
        const pubNow=pubRef.current;
        if(pubNow?.room===room){
          try{await pubNow.track.mute()}catch{}
        }
        try{await issueRadioPTT(channelId,"release")}catch{}
        setError(reason==="busy"?"Channel is busy — someone else is transmitting.":reason==="muted"?"You are muted on this channel.":"You are not authorized to transmit.");
        return reason==="busy"?"busy":"denied";
      };
      let mic;
      if(pub&&pub.room===room&&pub.deviceId===deviceId&&pub.track.mediaStreamTrack?.readyState==="live"){
        // Fast path: the mic is already open. Once the floor is granted, unmute it, and
        // republish it if the server unpublished it when the floor was last released.
        // Keep an existing published track silent until the server grants
        // this new PTT press. This prevents a previous lease/publication from
        // leaking audio while the floor request is being decided.
        try{pub.track.mediaStreamTrack.enabled=false}catch{}
        try{await pub.track.mute()}catch{}
        const result=await issueRadioPTT(channelId,"request");
        if(requestId!==pttRequestRef.current)return "stale";
        if(!result?.ok)throw new Error(result?.error||"Could not reach the radio server.");
        if(!result.granted)return await deny(result);
        try{pub.track.mediaStreamTrack.enabled=true}catch{}
        await pub.track.unmute();
        if(!isPublished(room,pub.track))await publishMicrophoneTrack(room,pub.track);
        if(requestId!==pttRequestRef.current){try{await pub.track.mute()}catch{}try{await issueRadioPTT(channelId,"release")}catch{}return "stale"}
        mic=pub.track;
      }else{
        // First PTT on this room or device: open the mic while the floor request is in
        // flight instead of after it, so audio starts as soon as the floor is granted.
        const micPromise=openMicrophone(deviceId);
        micPromise.catch(()=>{});
        let result;
        try{result=await issueRadioPTT(channelId,"request")}catch(err){micPromise.then(t=>t.stop(),()=>{});throw err}
        const dropMic=()=>micPromise.then(t=>t.stop(),()=>{});
        if(requestId!==pttRequestRef.current){dropMic();return "stale"}
        if(!result?.ok){dropMic();throw new Error(result?.error||"Could not reach the radio server.")}
        if(!result.granted){dropMic();return await deny(result)}
        const track=await micPromise;
        // Device names are only visible after the first mic permission, so refresh them now.
        refreshDevices();
        if(requestId!==pttRequestRef.current){track.stop();try{await issueRadioPTT(channelId,"release")}catch{}return "stale"}
        await dropPublished();
        try{mic=await publishMicrophoneTrack(room,track)}catch(err){track.stop();throw err}
        pubRef.current={track:mic,deviceId,room};
        if(requestId!==pttRequestRef.current){
          try{await mic.mute()}catch{}
          try{await issueRadioPTT(channelId,"release")}catch{}
          return "stale";
        }
      }
      micRef.current=mic;
      try{mic.mediaStreamTrack.enabled=true}catch{}
      floorRef.current=true;setError("");setState("transmitting");
      eventsRef.current.onOwnTalkStart?.(mic);
      let renewFailures=0;
      renewRef.current=setInterval(async()=>{
        if(!floorRef.current){renewFailures=0;return;}
        try{
          const r=await issueRadioPTT(channelId,"renew");
          if(!r?.ok)throw new Error();
          renewFailures=0;
        }catch{
          // A transient renew failure must not cut off a healthy transmission.
          // Give the server a few chances before treating the floor as lost.
          renewFailures++;
          if(renewFailures>=3)releasePTT();
        }
      },5000);
      return "granted";
    } catch(err){
      if(requestId!==pttRequestRef.current)return "stale";
      setError(err instanceof Error?err.message:"Microphone access failed.");
      floorRef.current=false;
      try{await issueRadioPTT(channelId,"release")}catch{}
      return "error";
    }
  },[channelId,session,releasePTT,refreshDevices,dropPublished]);

  const disconnect=useCallback(async()=>{
    connGenRef.current++;
    await releasePTT();
    await dropPublished();
    clearOnAir();setQuality("unknown");
    cleanupAudio();
    const room=roomRef.current;roomRef.current=null;
    await disconnectRadio(room);
    setSession(null);
    setParticipants([]);
    setState("ready");
  },[releasePTT,cleanupAudio,dropPublished,clearOnAir]);

  return {state,error,session,participants,muted,setMuted,devices,refreshDevices,connect,requestPTT,releasePTT,disconnect,room:roomRef.current,quality,onAir,lastHeard,replay};
}
