import { useCallback, useEffect, useRef, useState } from "react";
import { directCall, radioPresence } from "../lib/auth";
import { setSink } from "./useRadio";
import { connectRadio, disconnectRadio, publishMicrophone, unpublishMicrophone } from "../lib/livekit";

const sameData=(a,b)=>a===b||JSON.stringify(a)===JSON.stringify(b);
// The call list is checked often enough that an incoming call rings promptly; who is online
// changes slowly and costs the server a LiveKit lookup per channel, so it is checked less
// often and only while the window is visible.
const CALLS_POLL_MS=4000, PRESENCE_POLL_MS=15000;
// A call just started may not be in the server's list yet; don't end it for that.
const START_GRACE_MS=8000;
// LiveKit DisconnectReason: 1 = this side hung up; 4 and 5 = the server removed us or
// closed the call's room (the other side hung up).
const CLIENT_INITIATED=1, PARTICIPANT_REMOVED=4, ROOM_DELETED=5;
const REJOIN_DELAY_MS=2000;

export function useDirectCalls(userId, outputDeviceId="", micDeviceId="", volume=1) {
  // Calls follow the radio's volume knob, like the radio's own audio.
  const gainRef=useRef(volume);gainRef.current=volume;
  const outputRef=useRef(outputDeviceId);outputRef.current=outputDeviceId;
  const micIdRef=useRef(micDeviceId);micIdRef.current=micDeviceId;
  const roomRef=useRef(null), micRef=useRef(null), callIdRef=useRef(null), startedAtRef=useRef(0), joinRef=useRef(null), rejoinedRef=useRef(false), answeredRef=useRef(false);
  const audioElsRef=useRef(new Map());
  const [onlineUsers,setOnlineUsers]=useState([]),[controllersOnline,setControllersOnline]=useState(0),[incoming,setIncoming]=useState(null),[call,setCall]=useState(null),[callState,setCallState]=useState("idle"),[error,setError]=useState("");
  const callStateRef=useRef(callState);callStateRef.current=callState;

  useEffect(()=>{for(const el of audioElsRef.current.values())setSink(el,outputDeviceId)},[outputDeviceId]);
  useEffect(()=>{for(const el of audioElsRef.current.values())el.volume=volume},[volume]);
  const cleanupAudio=useCallback(()=>{for(const el of audioElsRef.current.values()){try{el.remove()}catch{}}audioElsRef.current.clear()},[]);
  const disconnect=useCallback(async()=>{
    cleanupAudio();
    const room=roomRef.current,mic=micRef.current;roomRef.current=null;micRef.current=null;
    await unpublishMicrophone(room,mic);
    // Rooms keep unpublished tracks open, and a dropped room has nothing left to unpublish,
    // so stop the mic here or Windows keeps it (and a headset's call mode) in use.
    try{mic?.stop()}catch{}
    await disconnectRadio(room);
  },[cleanupAudio]);
  // Clear the call on this side (the other side hung up, declined, or it was never answered).
  const clearCall=useCallback(async()=>{callIdRef.current=null;rejoinedRef.current=false;answeredRef.current=false;setCall(null);setCallState("idle");await disconnect()},[disconnect]);
  // "Calling…" until the other side has answered, then connected.
  const liveState=()=>answeredRef.current?"connected":"calling";

  const join=useCallback(async(callRecord)=>{
    // startCall joins right away, so a poll that sees the answer shares that join instead of
    // starting a second one; a join for another call waits for the earlier one to finish.
    const busy=joinRef.current;
    if(busy?.id===callRecord.id)return busy.p;
    if(busy)await busy.p.catch(()=>{});
    const p=(async()=>{
      await disconnect();
      const tokenData=await directCall("token",{call_id:callRecord.id});
      if(!tokenData?.ok)throw new Error(tokenData?.error||"Could not join direct call.");
      if(callIdRef.current!==callRecord.id)return;
      let room=null;
      try{
        room=await connectRadio(tokenData.liveKitToken,tokenData.liveKitUrl,{
          // roomRef is set as soon as the room exists, so audio from someone already in the
          // call (subscribed while connecting) is played, and hanging up cancels a slow join.
          onTrackSubscribed:(track,_pub,participant)=>{
            if(track.kind!=="audio"||roomRef.current!==room)return;
            const old=audioElsRef.current.get(participant.identity);if(old){try{old.remove()}catch{}}
            const el=track.attach();el.autoplay=true;el.playsInline=true;el.style.display="none";el.volume=gainRef.current;setSink(el,outputRef.current);document.body.appendChild(el);el.play().catch(()=>{});audioElsRef.current.set(participant.identity,el);
          },
          onReconnecting:()=>{if(roomRef.current===room)setCallState("reconnecting")},
          onReconnected:()=>{if(roomRef.current===room)setCallState(c=>c==="reconnecting"?liveState():c)},
          onDisconnected:reason=>{
            if(roomRef.current!==room||room.state==="connecting")return;
            const id=callIdRef.current;
            disconnect();
            if(!id||reason===CLIENT_INITIATED||reason===PARTICIPANT_REMOVED||reason===ROOM_DELETED){clearCall();return}
            // Dropped: rejoin once with a fresh pass, then give up and end the call.
            const giveUp=()=>{directCall("end",{call_id:id}).catch(()=>{});setError("The call dropped.");clearCall()};
            if(rejoinedRef.current){giveUp();return}
            rejoinedRef.current=true;setCallState("reconnecting");
            setTimeout(()=>{if(callIdRef.current===id)join(callRecord).catch(giveUp)},REJOIN_DELAY_MS);
          },
        },{onRoom:r=>{room=r;roomRef.current=r}});
      }catch(err){if(roomRef.current===room)roomRef.current=null;throw err}
      if(callIdRef.current!==callRecord.id||roomRef.current!==room){if(roomRef.current===room)roomRef.current=null;await disconnectRadio(room);return}
      const mic=await publishMicrophone(room,micIdRef.current||undefined);
      // Hung up while the microphone was opening: don't leave it open.
      if(callIdRef.current!==callRecord.id||roomRef.current!==room){try{mic?.stop()}catch{}return}
      micRef.current=mic;
      setCall(callRecord);
      if(callRecord.status==="active")answeredRef.current=true;
      setCallState(liveState());
    })();
    joinRef.current={id:callRecord.id,p};
    try{return await p}finally{if(joinRef.current?.p===p)joinRef.current=null}
  },[disconnect,clearCall]);

  // Polls every few seconds; skip overlapping runs and only update state when the
  // data actually changed, so an idle radio isn't re-rendered on every poll.
  const pollingRef=useRef(false);
  const refresh=useCallback(async()=>{
    if(!userId||pollingRef.current)return;
    pollingRef.current=true;
    try{
      const r=await directCall("list").catch(()=>null);
      if(!r||!Array.isArray(r.calls))return;
      const calls=r.calls||[];
      const inc=calls.find(x=>x.recipient_user_id===userId&&x.status==="ringing")||null;
      setIncoming(prev=>sameData(prev,inc)?prev:inc);
      if(!callIdRef.current)return;
      const current=calls.find(x=>x.id===callIdRef.current);
      // The list only holds ringing and active calls: a call missing from it has ended,
      // been declined or gone unanswered.
      if(!current){if(Date.now()-startedAtRef.current>START_GRACE_MS)await clearCall();return}
      if(current.status==="active"){
        answeredRef.current=true;
        setCall(prev=>sameData(prev,current)?prev:current);
        if(callStateRef.current==="calling"){
          if(roomRef.current)setCallState("connected");
          else await join(current);
        }
      }
    }catch{}finally{pollingRef.current=false}
  },[userId,clearCall,join]);
  const refreshPresence=useCallback(async()=>{
    if(!userId||(typeof document!=="undefined"&&document.hidden))return;
    const p=await radioPresence().catch(()=>null);
    if(p)setOnlineUsers(prev=>sameData(prev,p.users||[])?prev:(p.users||[]));
    // How many Controllers have the console open (an older server leaves this out).
    if(p)setControllersOnline(Number(p.controllersOnline)||0);
  },[userId]);

  useEffect(()=>{refresh();const id=setInterval(refresh,CALLS_POLL_MS);return()=>clearInterval(id)},[refresh]);
  useEffect(()=>{
    refreshPresence();const id=setInterval(refreshPresence,PRESENCE_POLL_MS);
    const vis=()=>{if(!document.hidden)refreshPresence()};
    document.addEventListener("visibilitychange",vis);
    return()=>{clearInterval(id);document.removeEventListener("visibilitychange",vis)};
  },[refreshPresence]);
  useEffect(()=>()=>{disconnect()},[disconnect]);

  const startCall=useCallback(async(recipient)=>{
    try{
      setError("");
      const r=await directCall("start",{recipient_user_id:recipient.userId});
      if(!r?.ok)throw new Error(r?.error||"Could not start call.");
      callIdRef.current=r.call.id;startedAtRef.current=Date.now();rejoinedRef.current=false;answeredRef.current=false;
      callStateRef.current="calling";setCall(r.call);setCallState("calling");
      await join(r.call);
    }catch(e){
      const id=callIdRef.current;
      if(id)directCall("end",{call_id:id}).catch(()=>{});
      setError(e instanceof Error?e.message:"Could not start call.");await clearCall();
    }
  },[join,clearCall]);
  const accept=useCallback(async()=>{
    if(!incoming)return;
    try{
      setError("");
      const r=await directCall("accept",{call_id:incoming.id});
      if(!r?.ok)throw new Error(r?.error||"Could not accept call.");
      setIncoming(null);
      // A join still running for an earlier call would make this one skip its own join.
      if(roomRef.current){callIdRef.current=null;await disconnect()}
      callIdRef.current=r.call.id;startedAtRef.current=Date.now();rejoinedRef.current=false;answeredRef.current=true;callStateRef.current="connected";
      await join(r.call);
    }catch(e){setError(e instanceof Error?e.message:"Could not accept call.");await clearCall()}
  },[incoming,join,clearCall]);
  const decline=useCallback(async()=>{if(!incoming)return;await directCall("decline",{call_id:incoming.id}).catch(()=>{});setIncoming(null)},[incoming]);
  const endCall=useCallback(async()=>{const id=callIdRef.current;if(id)await directCall("end",{call_id:id}).catch(()=>{});await clearCall()},[clearCall]);

  return {onlineUsers,controllersOnline,incoming,call,callState,error,startCall,accept,decline,endCall};
}
