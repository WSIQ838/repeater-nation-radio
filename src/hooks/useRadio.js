import { useCallback, useEffect, useRef, useState } from "react";
import { connectRadio, disconnectRadio, isPublished, openMicrophone, publishMicrophoneTrack, unpublishMicrophone, listAudioDevices } from "../lib/livekit";
import { issueRadioSession, issueRadioPTT } from "../lib/auth";

// Route a member's audio to the chosen speaker (WebView2 supports setSinkId; others keep the default).
export function setSink(el,deviceId){if(el?.setSinkId)el.setSinkId(deviceId||"").catch(()=>{})}

export function useRadio(channelId, channelInfo=null, outputDeviceId="") {
  const roomRef=useRef(null), micRef=useRef(null), floorRef=useRef(false), renewRef=useRef(null), audioElsRef=useRef(new Map()), pttRequestRef=useRef(0);
  const [state,setState]=useState("ready"),[error,setError]=useState(""),[session,setSession]=useState(null),[participants,setParticipants]=useState([]),[muted,setMuted]=useState(false),[devices,setDevices]=useState([]);
  // connect() hands attachAudio to LiveKit once, so read mute through a ref to stay current.
  const mutedRef=useRef(muted);mutedRef.current=muted;
  const outputRef=useRef(outputDeviceId);outputRef.current=outputDeviceId;
  const refresh=useCallback(()=>{const room=roomRef.current;if(room)setParticipants(Array.from(room.remoteParticipants.values()))},[]);
  const refreshDevices=useCallback(async()=>{try{setDevices(await listAudioDevices())}catch{}},[]);
  const attachAudio=useCallback((track,participant)=>{
    if(track.kind!=="audio")return;
    const existing=audioElsRef.current.get(participant.identity);
    if(existing){try{existing.remove()}catch{}}
    const el=track.attach();el.autoplay=true;el.playsInline=true;el.style.display="none";el.volume=mutedRef.current?0:1;setSink(el,outputRef.current);document.body.appendChild(el);audioElsRef.current.set(participant.identity,el);
    el.play().catch(()=>{});
  },[]);
  const cleanupAudio=useCallback(()=>{for(const el of audioElsRef.current.values()){try{el.remove()}catch{}}audioElsRef.current.clear()},[]);
  useEffect(()=>{
    refreshDevices();
    const md=navigator.mediaDevices;if(!md?.addEventListener)return;
    md.addEventListener("devicechange",refreshDevices);return()=>md.removeEventListener("devicechange",refreshDevices);
  },[refreshDevices]);
  useEffect(()=>{for(const el of audioElsRef.current.values())setSink(el,outputDeviceId)},[outputDeviceId]);

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
    if(pub){try{await pub.track.mute()}catch{}}
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
      room=await connectRadio(sessionData.liveKitToken,sessionData.liveKitUrl,{onTrackSubscribed:attachAudio,onDisconnected:()=>{if(roomRef.current!==room)return;if(renewRef.current)clearInterval(renewRef.current);renewRef.current=null;floorRef.current=false;micRef.current=null;if(pubRef.current?.room===room){try{pubRef.current.track.stop()}catch{}pubRef.current=null}cleanupAudio();roomRef.current=null;setSession(null);setParticipants([]);setState("ready")}});
      if(gen!==connGenRef.current){await disconnectRadio(room);return null}
      roomRef.current=room;setSession(sessionData);refresh();setState("listening");return room;
    } catch(err){if(gen!==connGenRef.current)return null;setError(err instanceof Error?err.message:"Unable to connect to radio.");setState("error");throw err}
  },[channelId,channelInfo?.zoneId,channelInfo?.number,refresh,attachAudio,cleanupAudio]);

  useEffect(()=>{for(const el of audioElsRef.current.values())el.volume=muted?0:1},[muted]);

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
    if(floorRef.current)return;
    if(!roomRef.current||!session){setError("Connect to the radio first.");return}
    if(!session.canTransmit){setError("You are not authorized to transmit on this channel.");return}
    try {
      floorAskedRef.current=true;
      const room=roomRef.current,pub=pubRef.current;
      const deny=r=>setError(r.reason==="busy"?"Channel is busy — someone else is transmitting.":r.reason==="muted"?"You are muted on this channel.":"You are not authorized to transmit.");
      let mic;
      if(pub&&pub.room===room&&pub.deviceId===deviceId&&pub.track.mediaStreamTrack?.readyState==="live"){
        // Fast path: the mic is already open. Once the floor is granted, unmute it, and
        // republish it if the server unpublished it when the floor was last released.
        const result=await issueRadioPTT(channelId,"request");
        if(requestId!==pttRequestRef.current)return;
        if(!result?.ok)throw new Error(result?.error||"Could not reach the radio server.");
        if(!result.granted){deny(result);return}
        await pub.track.unmute();
        if(!isPublished(room,pub.track))await publishMicrophoneTrack(room,pub.track);
        if(requestId!==pttRequestRef.current){try{await pub.track.mute()}catch{}try{await issueRadioPTT(channelId,"release")}catch{}return}
        mic=pub.track;
      }else{
        // First PTT on this room or device: open the mic while the floor request is in
        // flight instead of after it, so audio starts as soon as the floor is granted.
        const micPromise=openMicrophone(deviceId);
        micPromise.catch(()=>{});
        let result;
        try{result=await issueRadioPTT(channelId,"request")}catch(err){micPromise.then(t=>t.stop(),()=>{});throw err}
        const dropMic=()=>micPromise.then(t=>t.stop(),()=>{});
        if(requestId!==pttRequestRef.current){dropMic();return}
        if(!result?.ok){dropMic();throw new Error(result?.error||"Could not reach the radio server.")}
        if(!result.granted){dropMic();deny(result);return}
        const track=await micPromise;
        // Device names are only visible after the first mic permission, so refresh them now.
        refreshDevices();
        if(requestId!==pttRequestRef.current){track.stop();try{await issueRadioPTT(channelId,"release")}catch{}return}
        await dropPublished();
        try{mic=await publishMicrophoneTrack(room,track)}catch(err){track.stop();throw err}
        pubRef.current={track:mic,deviceId,room};
        if(requestId!==pttRequestRef.current){
          try{await mic.mute()}catch{}
          try{await issueRadioPTT(channelId,"release")}catch{}
          return;
        }
      }
      micRef.current=mic;
      floorRef.current=true;setError("");setState("transmitting");
      renewRef.current=setInterval(async()=>{
        if(!floorRef.current)return;
        try{const r=await issueRadioPTT(channelId,"renew");if(!r?.ok)throw new Error()}catch{releasePTT()}
      },10000);
    } catch(err){
      if(requestId!==pttRequestRef.current)return;
      setError(err instanceof Error?err.message:"Microphone access failed.");
      floorRef.current=false;
      try{await issueRadioPTT(channelId,"release")}catch{}
    }
  },[channelId,session,releasePTT,refreshDevices,dropPublished]);

  const disconnect=useCallback(async()=>{
    connGenRef.current++;
    await releasePTT();
    await dropPublished();
    cleanupAudio();
    const room=roomRef.current;roomRef.current=null;
    await disconnectRadio(room);
    setSession(null);
    setParticipants([]);
    setState("ready");
  },[releasePTT,cleanupAudio,dropPublished]);

  return {state,error,session,participants,muted,setMuted,devices,refreshDevices,connect,requestPTT,releasePTT,disconnect,room:roomRef.current};
}
