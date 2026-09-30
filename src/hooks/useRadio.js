import { useCallback, useEffect, useRef, useState } from "react";
import { connectRadio, disconnectRadio, publishMicrophone, unpublishMicrophone } from "../lib/livekit";
import { issueRadioSession, issueRadioPTT } from "../lib/auth";

export function useRadio(channelId) {
  const roomRef=useRef(null), micRef=useRef(null), floorRef=useRef(false), renewRef=useRef(null);
  const [state,setState]=useState("ready"),[error,setError]=useState(""),[session,setSession]=useState(null),[participants,setParticipants]=useState([]);
  const refresh=useCallback(()=>{const room=roomRef.current;if(room)setParticipants(Array.from(room.remoteParticipants.values()))},[]);
  const connect=useCallback(async()=>{
    setError("");setState("connecting");
    try {
      const sessionData=await issueRadioSession(channelId);
      if(!sessionData?.ok) throw new Error(sessionData?.error||"Could not start radio session.");
      const room=await connectRadio(sessionData.liveKitToken,sessionData.liveKitUrl,{onDisconnected:()=>{roomRef.current=null;setState("ready")}});
      roomRef.current=room;setSession(sessionData);refresh();setState("listening");return room;
    } catch(err){setError(err instanceof Error?err.message:"Unable to connect to radio.");setState("error");throw err}
  },[channelId,refresh]);
  useEffect(()=>{const room=roomRef.current;if(!room)return;const sync=()=>refresh();room.on("participantConnected",sync);room.on("participantDisconnected",sync);room.on("participantMetadataChanged",sync);return()=>{room.off("participantConnected",sync);room.off("participantDisconnected",sync);room.off("participantMetadataChanged",sync)}},[refresh,state]);
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
  const disconnect=useCallback(async()=>{await releasePTT();await disconnectRadio(roomRef.current);roomRef.current=null;setSession(null);setParticipants([]);setState("ready")},[releasePTT]);
  return {state,error,session,participants,connect,requestPTT,releasePTT,disconnect,room:roomRef.current};
}