import { useCallback, useEffect, useRef, useState } from "react";
import { connectRadio, disconnectRadio, publishMicrophone, unpublishMicrophone, listAudioDevices } from "../lib/livekit";
import { issueRadioSession, issueRadioPTT } from "../lib/auth";

export function useRadio(channelId, channelInfo=null) {
  const roomRef=useRef(null), micRef=useRef(null), floorRef=useRef(false), renewRef=useRef(null), audioElsRef=useRef(new Map()), pttRequestRef=useRef(0);
  const [state,setState]=useState("ready"),[error,setError]=useState(""),[session,setSession]=useState(null),[participants,setParticipants]=useState([]),[muted,setMuted]=useState(false),[devices,setDevices]=useState([]);
  // connect() hands attachAudio to LiveKit once, so read mute through a ref to stay current.
  const mutedRef=useRef(muted);mutedRef.current=muted;
  const refresh=useCallback(()=>{const room=roomRef.current;if(room)setParticipants(Array.from(room.remoteParticipants.values()))},[]);
  const refreshDevices=useCallback(async()=>{try{setDevices(await listAudioDevices())}catch{}},[]);
  const attachAudio=useCallback((track,participant)=>{
    if(track.kind!=="audio")return;
    const existing=audioElsRef.current.get(participant.identity);
    if(existing){try{existing.remove()}catch{}}
    const el=track.attach();el.autoplay=true;el.playsInline=true;el.style.display="none";el.volume=mutedRef.current?0:1;document.body.appendChild(el);audioElsRef.current.set(participant.identity,el);
    el.play().catch(()=>{});
  },[]);
  const cleanupAudio=useCallback(()=>{for(const el of audioElsRef.current.values()){try{el.remove()}catch{}}audioElsRef.current.clear()},[]);
  useEffect(()=>{refreshDevices()},[refreshDevices]);

  const releasePTT=useCallback(async()=>{
    pttRequestRef.current++;
    floorRef.current=false;
    if(renewRef.current)clearInterval(renewRef.current);
    renewRef.current=null;
    const room=roomRef.current;
    const mic=micRef.current;
    micRef.current=null;
    if(mic)await unpublishMicrophone(room,mic);
    try{await issueRadioPTT(channelId,"release")}catch{}
    if(roomRef.current)setState("listening");
  },[channelId]);

  const connect=useCallback(async()=>{
    setError("");setState("connecting");
    try {
      const sessionData=await issueRadioSession(channelId, channelInfo?.zoneId, channelInfo?.number);
      if(!sessionData?.ok) throw new Error(sessionData?.error||"Could not start radio session.");
      const room=await connectRadio(sessionData.liveKitToken,sessionData.liveKitUrl,{onTrackSubscribed:attachAudio,onDisconnected:()=>{if(renewRef.current)clearInterval(renewRef.current);renewRef.current=null;floorRef.current=false;micRef.current=null;cleanupAudio();roomRef.current=null;setSession(null);setParticipants([]);setState("ready")}});
      roomRef.current=room;setSession(sessionData);refresh();setState("listening");return room;
    } catch(err){setError(err instanceof Error?err.message:"Unable to connect to radio.");setState("error");throw err}
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
      const result=await issueRadioPTT(channelId,"request");
      if(requestId!==pttRequestRef.current)return;
      if(!result?.ok) throw new Error(result?.error||"Could not reach the radio server.");
      if(!result.granted){setError(result.reason==="busy"?"Channel is busy — someone else is transmitting.":result.reason==="muted"?"You are muted on this channel.":"You are not authorized to transmit.");return}
      const mic=await publishMicrophone(roomRef.current,deviceId);
      if(requestId!==pttRequestRef.current){
        await unpublishMicrophone(roomRef.current,mic);
        try{await issueRadioPTT(channelId,"release")}catch{}
        return;
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
  },[channelId,session,releasePTT]);

  const disconnect=useCallback(async()=>{
    await releasePTT();
    cleanupAudio();
    await disconnectRadio(roomRef.current);
    roomRef.current=null;
    setSession(null);
    setParticipants([]);
    setState("ready");
  },[releasePTT,cleanupAudio]);

  return {state,error,session,participants,muted,setMuted,devices,refreshDevices,connect,requestPTT,releasePTT,disconnect,room:roomRef.current};
}
