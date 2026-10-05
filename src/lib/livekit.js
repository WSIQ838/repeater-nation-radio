import { config } from "./config";

// livekit-client is most of the bundle; load it on first use (or prewarm) instead of at startup.
let livekitModule=null;
const livekit=()=>livekitModule||(livekitModule=import("livekit-client").catch(err=>{livekitModule=null;throw err}));

// Load the voice library and open DNS/TLS to the voice server ahead of the first connect.
export async function prewarmRadio(livekitUrl=config.livekitUrl){
  try{const {Room}=await livekit();await new Room().prepareConnection(livekitUrl)}catch{}
}

// opts.onRoom(room) gets the Room before it starts connecting, so the caller can cancel
// an attempt that is still in progress with room.disconnect().
export async function connectRadio(token, livekitUrl=config.livekitUrl, callbacks={}, opts={}) {
  const { Room, RoomEvent } = await livekit();
  if(!token) throw new Error("A LiveKit token is required.");
  // The radio server revokes publish permission on every PTT release, which makes
  // LiveKit unpublish the mic. Keep the mic track itself open so the next PTT can
  // republish it without opening the microphone (or switching a Bluetooth headset's
  // audio profile) again.
  const room=new Room({adaptiveStream:true,dynacast:true,stopLocalTrackOnUnpublish:false});
  room.on(RoomEvent.ParticipantConnected,p=>callbacks.onParticipantConnected?.(p));
  room.on(RoomEvent.ParticipantDisconnected,p=>callbacks.onParticipantDisconnected?.(p));
  room.on(RoomEvent.TrackSubscribed,(track,pub,participant)=>callbacks.onTrackSubscribed?.(track,pub,participant));
  room.on(RoomEvent.TrackUnsubscribed,(track,pub,participant)=>callbacks.onTrackUnsubscribed?.(track,pub,participant));
  room.on(RoomEvent.TrackMuted,(pub,participant)=>{if(participant!==room.localParticipant)callbacks.onTrackMuted?.(pub,participant)});
  room.on(RoomEvent.TrackUnmuted,(pub,participant)=>{if(participant!==room.localParticipant)callbacks.onTrackUnmuted?.(pub,participant)});
  room.on(RoomEvent.ParticipantAttributesChanged,(changed,participant)=>{if(participant!==room.localParticipant)callbacks.onAttributes?.(changed,participant)});
  room.on(RoomEvent.ConnectionQualityChanged,(quality,participant)=>{if(participant===room.localParticipant)callbacks.onQuality?.(quality)});
  room.on(RoomEvent.Disconnected,reason=>callbacks.onDisconnected?.(reason));
  // Only a full reconnect stops audio; a signal-only reconnect keeps media flowing.
  room.on(RoomEvent.Reconnecting,()=>callbacks.onReconnecting?.());
  room.on(RoomEvent.Reconnected,()=>callbacks.onReconnected?.());
  room.on(RoomEvent.ParticipantPermissionsChanged,(_prev,participant)=>{if(participant===room.localParticipant)callbacks.onPermissions?.(participant.permissions)});
  opts.onRoom?.(room);
  await room.connect(livekitUrl,token);
  return room;
}

export async function listAudioDevices(){
  if(!navigator.mediaDevices?.enumerateDevices)return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput"||d.kind==="audiooutput");
}

// Opening the mic is split from publishing so PTT can open it while the floor request is in flight.
export async function openMicrophone(deviceId) {
  const { createLocalAudioTrack } = await livekit();
  // A plain string id makes LiveKit try that exact mic first and fall back to the closest
  // one if it was unplugged or renamed, instead of failing every PTT.
  try{return await createLocalAudioTrack(deviceId?{deviceId}:undefined)}
  catch(err){throw micError(err)}
}

// The browser's own wording ("Permission denied", "Could not start audio source") doesn't
// say what to do. Name the cause and the fix; the original error stays as .cause.
export function micError(err){
  const name=err?.name||"",raw=err?.message||"";
  const ua=navigator.userAgent||"",mac=/Mac/i.test(navigator.platform||ua),win=/Windows/i.test(ua);
  let text="";
  if(name==="NotAllowedError"||name==="SecurityError"||/permission denied|not allowed/i.test(raw))
    text=win?"Windows is blocking the mic: Settings › Privacy & security › Microphone"
      :mac?"Mac is blocking the mic: System Settings › Privacy & Security › Microphone"
      :"The system is blocking the mic: allow microphone access for Repeater Nation";
  else if(name==="NotFoundError"||/requested device not found/i.test(raw))
    text="No microphone found: plug one in or pick one in Settings";
  else if(name==="NotReadableError"||/could not start audio source/i.test(raw))
    text="Microphone busy or off: close other apps using it";
  if(!text)return err;
  return Object.assign(new Error(text),{name,cause:err});
}

// The radio server grants publish permission when it grants the floor, and that update
// can reach LiveKit a moment after the server's answer. Wait briefly for it.
export function waitForPublishPermission(room,ms=2000){
  if(!room||room.localParticipant?.permissions?.canPublish!==false)return Promise.resolve(true);
  return new Promise(resolve=>{
    const done=ok=>{clearTimeout(t);room.off("participantPermissionsChanged",check);resolve(ok)};
    const check=(_prev,participant)=>{if(participant===room.localParticipant&&participant.permissions?.canPublish)done(true)};
    const t=setTimeout(()=>done(false),ms);
    room.on("participantPermissionsChanged",check);
  });
}

export async function publishMicrophoneTrack(room,track) {
  const { Track, ConnectionState } = await livekit();
  if(!room || room.state!==ConnectionState.Connected) throw new Error("Radio connection is not active.");
  await room.localParticipant.publishTrack(track,{name:"radio-microphone",source:Track.Source.Microphone,dtx:true,red:true});
  return track;
}

export async function publishMicrophone(room,deviceId) {
  const track=await openMicrophone(deviceId);
  try{return await publishMicrophoneTrack(room,track)}catch(err){track.stop();throw err}
}

export function isPublished(room,track){
  if(!room||!track)return false;
  for(const pub of room.localParticipant.trackPublications.values())if(pub.track===track)return true;
  return false;
}

export async function unpublishMicrophone(room,track) {
  if(!room||!track)return;
  try{await room.localParticipant.unpublishTrack(track,true)}catch{}
}

// Share a member status (At Scene, En Route…) as a participant attribute, so every radio
// on the channel sees it, including members who join later. Needs the radio server to
// grant canUpdateOwnMetadata; returns false when it doesn't.
export function canShareStatus(room){return !!room?.localParticipant?.permissions?.canUpdateMetadata}
export async function shareStatus(room,status){
  if(!canShareStatus(room))return false;
  await room.localParticipant.setAttributes({status:status||""});
  return true;
}

export async function disconnectRadio(room){if(!room)return;await room.disconnect()}