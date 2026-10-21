import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { base44 } from '@/api/base44Client';

function parseMeta(p) {
  try { const m=JSON.parse(p?.metadata||'{}'); return {callsign:m.callsign||null,displayName:m.displayName||p?.name||'Member'}; }
  catch { return {callsign:null,displayName:p?.name||'Member'}; }
}

const PRESENCE_REFRESH_MS = 15000;
// With the radio collapsed, incoming calls arrive through the realtime
// RadioDirectCall subscription below; this slow poll is only a backstop.
const IDLE_REFRESH_MS = 60000;
const CALL_POLL_MS = 1500;

export default function useRadioDirectCall(enabled, currentChannelId, userId, audioOptions = {}) {
  const [onlineUsers,setOnlineUsers]=useState([]);
  const [call,setCall]=useState(null);
  const [incoming,setIncoming]=useState(null);
  const [callState,setCallState]=useState('idle');
  const [activeCallUserIds,setActiveCallUserIds]=useState(new Set());
  const roomRef=useRef(null);
  const audioEls=useRef(new Map());
  const currentCallId=useRef(null);
  const joinRef=useRef(null);
  const presenceEnabled=audioOptions.presenceEnabled!==false;
  // A tab left open after the login expired got a 401 on every poll, forever.
  // Stop polling once the server says the session is gone; a new login (new
  // userId) starts it again.
  const authLost=useRef(false);
  useEffect(()=>{authLost.current=false;},[userId]);
  const noteAuth=(e)=>{if(e?.status===401)authLost.current=true;};

  const disconnect=useCallback(async()=>{
    const room=roomRef.current;
    roomRef.current=null;
    for(const entry of audioEls.current.values()){
      try{entry.track.detach(entry.el);}catch{}
      try{entry.el.pause();}catch{}
      try{entry.el.remove();}catch{}
    }
    audioEls.current.clear();
    try{await room?.disconnect();}catch{}
  },[]);

  const refresh=useCallback(async()=>{
    if(!enabled||authLost.current)return;
    if(presenceEnabled){
      try{
        const r=await base44.functions.invoke('radio-presence',{});
        const d=r?.data||r;
        setOnlineUsers(d?.users||[]);
        setActiveCallUserIds(new Set(d?.busyUserIds||[]));
      }catch(e){noteAuth(e);}
    }
    try{
      const callResponse=await base44.functions.invoke('radio-direct-call',{action:'list'});
      const rows=(callResponse?.data||callResponse)?.calls||[];
      const mine=(rows||[]).filter(x=>['ringing','active'].includes(x.status));
      const ringing=mine.find(x=>x.recipient_user_id===userId && x.status==='ringing');
      setIncoming(ringing||null);
      if(currentCallId.current){
        const c=mine.find(x=>x.id===currentCallId.current);
        if(c)setCall(c);
        else if(!mine.some(x=>x.id===currentCallId.current)){
          setCall(null);setCallState('idle');currentCallId.current=null;await disconnect();
        }
      }
    }catch(e){noteAuth(e);}
  },[enabled,presenceEnabled,disconnect,userId]);

  // Every logged-in member runs this on every page, so it was a large share
  // of the app's request budget. Poll only from a visible tab (or while in a
  // call), slowly when the radio is collapsed, and react to call changes via
  // realtime instead of waiting for the next poll.
  useEffect(()=>{
    if(!enabled)return;
    const tick=()=>{ if(!document.hidden||currentCallId.current) refresh(); };
    const id=setInterval(tick,presenceEnabled?PRESENCE_REFRESH_MS:IDLE_REFRESH_MS);
    const onVisible=()=>{ if(!document.hidden) refresh(); };
    document.addEventListener('visibilitychange',onVisible);
    let timer=null;
    const unsubscribe=base44.entities.RadioDirectCall.subscribe((event)=>{
      const row=event?.data;
      if(row&&row.caller_user_id!==userId&&row.recipient_user_id!==userId)return;
      if(timer)return;
      timer=setTimeout(()=>{timer=null;refresh();},300);
    });
    refresh();
    return()=>{
      clearInterval(id);
      document.removeEventListener('visibilitychange',onVisible);
      if(timer)clearTimeout(timer);
      try{unsubscribe?.();}catch{}
    };
  },[enabled,refresh,presenceEnabled,userId]);

  const attach=useCallback((track,participant)=>{
    if(track.kind!==Track.Kind.Audio)return;
    const existing=audioEls.current.get(participant.identity);
    if(existing){
      try{existing.track.detach(existing.el);}catch{}
      try{existing.el.pause();}catch{}
      try{existing.el.remove();}catch{}
    }
    const el=document.createElement('audio');
    el.autoplay=true; el.playsInline=true;
    el.volume=Math.max(0,Math.min(1,Number(audioOptions.callVolume??80)/100));
    if(audioOptions.callSpeakerMuted)el.volume=0;
    if(audioOptions.callSpeakerDeviceId&&typeof el.setSinkId==='function')el.setSinkId(audioOptions.callSpeakerDeviceId).catch(()=>{});
    track.attach(el);el.dataset.directParticipant=participant.identity;document.body.appendChild(el);
    audioEls.current.set(participant.identity,{track,el});
  },[audioOptions.callVolume,audioOptions.callSpeakerMuted,audioOptions.callSpeakerDeviceId]);

  const join=useCallback(async(callRecord,nextState='connected')=>{
    await disconnect();
    const r=await base44.functions.invoke('radio-direct-call',{action:'token',call_id:callRecord.id});
    const d=r?.data||r;if(!d?.ok)throw new Error(d?.error||'Could not join direct call');
    const room=new Room({adaptiveStream:true,dynacast:true});
    room.on(RoomEvent.TrackSubscribed,(track,_pub,p)=>attach(track,p));
    room.on(RoomEvent.TrackUnsubscribed,(track,_pub,p)=>{
      const entry=audioEls.current.get(p.identity);
      if(entry?.track===track){
        try{track.detach(entry.el);}catch{}
        try{entry.el.pause();}catch{}
        try{entry.el.remove();}catch{}
        audioEls.current.delete(p.identity);
      }
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged,()=>{if(!room.canPlaybackAudio)room.startAudio().catch(()=>{});});
    room.on(RoomEvent.Reconnecting,()=>{if(currentCallId.current) setCallState('connecting');});
    room.on(RoomEvent.Reconnected,()=>{if(currentCallId.current) { setCallState('connected'); refresh(); }});
    // LiveKit gave up reconnecting. Rejoin once with a fresh token; if that
    // fails too, end the call instead of sitting on "connecting" forever.
    // (A deliberate disconnect clears roomRef first, so it's ignored here.)
    room.on(RoomEvent.Disconnected,()=>{
      const callId=currentCallId.current;
      if(!callId||roomRef.current!==room)return;
      roomRef.current=null;
      setCallState('connecting');
      setTimeout(async()=>{
        if(currentCallId.current!==callId)return;
        try{await joinRef.current({...callRecord,id:callId},callRecord.status==='ringing'?'calling':'connected');}
        catch{
          await base44.functions.invoke('radio-direct-call',{action:'end',call_id:callId}).catch(()=>{});
          if(currentCallId.current===callId){currentCallId.current=null;setCall(null);setCallState('idle');await disconnect();}
        }
      },2000);
    });
    await room.connect(d.liveKitUrl,d.liveKitToken);
    await room.startAudio().catch(()=>{});
    await room.localParticipant.setMicrophoneEnabled(audioOptions.callMicMuted!==true);
    roomRef.current=room;
    setCallState(nextState);setCall(callRecord);currentCallId.current=callRecord.id;
  },[disconnect,attach,audioOptions.callMicMuted]);
  joinRef.current=join;

  const startCall=useCallback(async(user)=>{
    if(callState!=='idle'&& !call){currentCallId.current=null;setCallState('idle');setCall(null);}
    if(callState!=='idle'&&call)return;
    const r=await base44.functions.invoke('radio-direct-call',{action:'start',recipient_user_id:user.userId});
    const d=r?.data||r;if(!d?.ok)throw new Error(d?.error||'Could not start call');
    currentCallId.current=d.call.id;setCall(d.call);setCallState('calling');
    await join(d.call,'calling');
    await refresh();
  },[callState,call,join,refresh]);

  const accept=useCallback(async()=>{
    if(!incoming)return;
    const r=await base44.functions.invoke('radio-direct-call',{action:'accept',call_id:incoming.id});
    const d=r?.data||r;if(!d?.ok)throw new Error(d?.error||'Could not accept call');
    currentCallId.current=incoming.id;setIncoming(null);setCall(d.call);setCallState('connected');await join(d.call);
  },[incoming,join]);

  const decline=useCallback(async()=>{
    if(!incoming)return;
    await base44.functions.invoke('radio-direct-call',{action:'decline',call_id:incoming.id}).catch(()=>{});
    setIncoming(null);
  },[incoming]);

  useEffect(()=>{
    const muted=!!audioOptions.callSpeakerMuted;
    const volume=muted?0:Math.max(0,Math.min(1,Number(audioOptions.callVolume??80)/100));
    for(const entry of audioEls.current.values()){
      entry.el.volume=volume;
      if(audioOptions.callSpeakerDeviceId&&typeof entry.el.setSinkId==='function')entry.el.setSinkId(audioOptions.callSpeakerDeviceId).catch(()=>{});
    }
  },[audioOptions.callVolume,audioOptions.callSpeakerMuted,audioOptions.callSpeakerDeviceId]);

  const endCall=useCallback(async()=>{
    const id=currentCallId.current;
    if(id)await base44.functions.invoke('radio-direct-call',{action:'end',call_id:id}).catch(()=>{});
    currentCallId.current=null;setCall(null);setCallState('idle');await disconnect();
  },[disconnect]);

  useEffect(()=>{
    if(callState!=='calling'||!currentCallId.current)return;
    let cancelled=false;
    const tick=async()=>{
      try{
        const callResponse=await base44.functions.invoke('radio-direct-call',{action:'list'});
        const rows=(callResponse?.data||callResponse)?.calls||[];
        const c=(rows||[]).find(x=>x.id===currentCallId.current);
        if(cancelled)return;
        if(c?.status==='active'){
          setCall(c);
          if(roomRef.current)setCallState('connected');
          else{setCallState('connecting');await join(c);}
        }else if(c?.status==='declined'||c?.status==='ended'){
          currentCallId.current=null;setCall(null);setCallState('idle');await disconnect();
        }
      }catch{}
    };
    const id=setInterval(tick,CALL_POLL_MS);tick();
    return()=>{cancelled=true;clearInterval(id);};
  },[callState,join]);

  useEffect(()=>()=>{disconnect();},[disconnect]);

  return {onlineUsers,incoming,call,callState,activeCallUserIds,startCall,accept,decline,endCall};
}