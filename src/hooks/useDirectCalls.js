import { useCallback, useEffect, useRef, useState } from "react";
import { directCall, radioPresence } from "../lib/auth";
import { connectRadio, disconnectRadio, publishMicrophone, unpublishMicrophone } from "../lib/livekit";

export function useDirectCalls(userId) {
  const roomRef=useRef(null), micRef=useRef(null), callIdRef=useRef(null);
  const audioElsRef=useRef(new Map());
  const [onlineUsers,setOnlineUsers]=useState([]),[incoming,setIncoming]=useState(null),[call,setCall]=useState(null),[callState,setCallState]=useState("idle"),[error,setError]=useState("");

  const cleanupAudio=useCallback(()=>{for(const el of audioElsRef.current.values()){try{el.remove()}catch{}}audioElsRef.current.clear()},[]);
  const disconnect=useCallback(async()=>{cleanupAudio();await unpublishMicrophone(roomRef.current,micRef.current);micRef.current=null;await disconnectRadio(roomRef.current);roomRef.current=null},[cleanupAudio]);

  const join=useCallback(async(callRecord)=>{
    await disconnect();
    const tokenData=await directCall("token",{call_id:callRecord.id});
    if(!tokenData?.ok)throw new Error(tokenData?.error||"Could not join direct call.");
    const room=await connectRadio(tokenData.liveKitToken,tokenData.liveKitUrl,{onTrackSubscribed:(track,_pub,participant)=>{
      if(track.kind!=="audio")return;
      const el=track.attach();el.autoplay=true;el.playsInline=true;el.style.display="none";document.body.appendChild(el);el.play().catch(()=>{});audioElsRef.current.set(participant.identity,el);
    },onDisconnected:()=>setCallState("idle")});
    roomRef.current=room;
    micRef.current=await publishMicrophone(room);
    setCall(callRecord);callIdRef.current=callRecord.id;setCallState("connected");
  },[disconnect]);

  const refresh=useCallback(async()=>{
    if(!userId)return;
    try{const p=await radioPresence();setOnlineUsers(p?.users||[])}catch{}
    try{
      const r=await directCall("list");const calls=r?.calls||[];
      const inc=calls.find(x=>x.recipient_user_id===userId&&x.status==="ringing");
      setIncoming(inc||null);
      const current=callIdRef.current?calls.find(x=>x.id===callIdRef.current):null;
      if(current?.status==="active")setCall(current);
      if(current?.status==="declined"||current?.status==="ended"){callIdRef.current=null;setCall(null);setCallState("idle");await disconnect()}
      if(callState==="calling"&&callIdRef.current){
        const pending=calls.find(x=>x.id===callIdRef.current);
        if(pending?.status==="active")await join(pending);
      }
    }catch{}
  },[userId,callState,disconnect,join]);

  useEffect(()=>{refresh();const id=setInterval(refresh,3000);return()=>clearInterval(id)},[refresh]);
  useEffect(()=>()=>{disconnect()},[disconnect]);

  const startCall=useCallback(async(recipient)=>{
    try{setError("");const r=await directCall("start",{recipient_user_id:recipient.userId});if(!r?.ok)throw new Error(r?.error||"Could not start call.");callIdRef.current=r.call.id;setCall(r.call);setCallState("calling");await join(r.call)}catch(e){setError(e instanceof Error?e.message:"Could not start call.");setCallState("idle")}},[join]);
  const accept=useCallback(async()=>{if(!incoming)return;try{setError("");const r=await directCall("accept",{call_id:incoming.id});if(!r?.ok)throw new Error(r?.error||"Could not accept call.");setIncoming(null);await join(r.call)}catch(e){setError(e instanceof Error?e.message:"Could not accept call.")}},[incoming,join]);
  const decline=useCallback(async()=>{if(!incoming)return;await directCall("decline",{call_id:incoming.id}).catch(()=>{});setIncoming(null)},[incoming]);
  const endCall=useCallback(async()=>{const id=callIdRef.current;if(id)await directCall("end",{call_id:id}).catch(()=>{});callIdRef.current=null;setCall(null);setCallState("idle");await disconnect()},[disconnect]);

  return {onlineUsers,incoming,call,callState,error,startCall,accept,decline,endCall};
}