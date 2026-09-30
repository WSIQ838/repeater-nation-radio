import { useCallback, useEffect, useRef, useState } from "react";
import { connectRadio, disconnectRadio, publishMicrophone, unpublishMicrophone, listAudioDevices } from "../lib/livekit";
import { issueRadioSession, issueRadioPTT } from "../lib/auth";

export function useRadio(channelId) {
  const roomRef=useRef(null), micRef=useRef(null), floorRef=useRef(false), renewRef=useRef(null), audioElsRef=useRef(new Map());
  const [state,setState]=useState("ready"),[error,setError]=useState(""),[session,setSession]=useState(null),[participants,setParticipants]=useState([]),[muted,setMuted]=useState(false),[devices,setDevices]=useState([]);
  const refresh=useCallback(()=>{const room=roomRef.current;if(room)setParticipants(Array.from(room.remoteParticipants.values()))},[]);\n  const refreshDevices=useCallback(async()=>{try{setDevices(await listAudioDevices())}catch{}},[]);
  const attachAudio=useCallback((track,participant)=>{
    if(track.kind!=="audio")return;
    const existing=audioElsRef.current.get(participant.identity);
    if(existing){try{existing.remove()}catch{}}
    const el=track.attach();el.autoplay=true;el.playsInline=true;el.style.display="none";el.volume=muted?0:1;document.body.appendChild(el);audioElsRef.current.set(participant.identity,el);
    el.play().catch(()=>{});
  },[muted]);
  const cleanupAudio=useCallback(()=>{for(const el of audioElsRef.current.values()){try{el.remove()}catch{}}audioElsRef.current.clear()},[]);
  useEffect(()=>{refreshDevices()},[refreshDevices]);\n  const connect=useCallback(async()=>{
    setError("");setState("connecting");
    try {
      const sessionData=await issueRadioSession(channelId);
      if(!sessionData?.ok) throw new Error(sessionData?.error||"Could not start radio session.");
      const room=await connectRadio(sessionData.liveKitToken,sessionData.liveKitUrl,{onTrackSubscribed:attachAudio,onDisconnected:()=>{cleanupAudio();roomRef.current=null;setState("ready")}});
      roomRef.current=room;setSession(sessionData);refresh();setState("listening");return room;
    } catch(err){setError(err instanceof Error?err.message:"Unable to connect to radio.");setState("error");throw err}
  },[channelId,refresh,attachAudio,cleanupAudio]);
  useEffect(()=>{for(const el of audioElsRef.current.values())el.volume=muted?0:1},[muted]);
  useEffect(()=>{const room=roomRef.current;if(!room)return;const sync=()=>refresh();const onSub=(track,_pub,p)=>attachAudio(track,p);const onUnsub=(track,_pub,p)=>{const el=audioElsRef.current.get(p.identity);if(el){try{track.detach(el)}catch{}try{el.remove()}catch{}audioElsRef.current.delete(p.identity)}};room.on("participantConnected",sync);room.on("participantDisconnected",sync);room.on("participantMetadataChanged",sync);room.on("trackSubscribed",onSub);room.on("trackUnsubscribed",onUnsub);return()=>{room.off("participantConnected",sync);room.off("participantDisconnected",sync);room.off("participantMetadataChanged",sync);room.off("trackSubscribed",onSub);room.off("trackUnsubscribed",onUnsub)}},[refresh,attachAudio,state]);
  const requestPTT=useCallback(async()=>{
    if(floorRef.current)return;
    if(!roomRef.current||!session){setError("Connect to the radio first.");return}
    if(!session.canTransmit){setError("You are not authorized to transmit on this channel.");return}
    try {
      const result=await issueRadioPTT(channelId,"request");
      if(!result?.ok) throw new Error(result?.error||"Could not reach the radio server.");
      if(!result.granted){setError(result.reason==="busy"?"Channel is busy — someone else is transmitting.":result.reason==="muted"?"You are muted on this channel.":"You are not authorized to transmit.");return}
      micRef.current=await publishMicrophone(roomRef.current);
      floorRef.current=true;setError("");setState("transmitting");
      renewRef.current=setInterval(async()=>{if(!floorRef.current)return;try{const r=await issueRadioPTT(channelId,"renew");if(!r?.ok)throw new Error()}catch{releasePTT()}},10000);
    } catch(err){setError(err instanceof Error?err.message:"Microphone access failed.");floorRef.current=false;try{await issueRadioPTT(channelId,"release")}catch{}}
  },[channelId,session]);
  const releasePTT=useCallback(async()=>{
    if(!floorRef.current)return;floorRef.current=false;if(renewRef.current)clearInterval(renewRef.current);renewRef.current=null;
    await unpublishMicrophone(roomRef.current,micRef.current);micRef.current=null;
    try{await issueRadioPTT(channelId,"release")}catch{}
    if(roomRef.current)setState("listening");
  },[channelId]);
  const disconnect=useCallback(async()=>{await releasePTT();cleanupAudio();await disconnectRadio(roomRef.current);roomRef.current=null;setSession(null);setParticipants([]);setState("ready")},[releasePTT,cleanupAudio]);
  return {state,error,session,participants,muted,setMuted,devices,refreshDevices,connect,requestPTT,releasePTT,disconnect,room:roomRef.current};
}