import { config } from "./config";

// livekit-client is most of the bundle; load it on first use (or prewarm) instead of at startup.
let livekitModule=null;
const livekit=()=>livekitModule||(livekitModule=import("livekit-client").catch(err=>{livekitModule=null;throw err}));

// Load the voice library and open DNS/TLS to the voice server ahead of the first connect.
export async function prewarmRadio(livekitUrl=config.livekitUrl){
  try{const {Room}=await livekit();await new Room().prepareConnection(livekitUrl)}catch{}
}

export async function connectRadio(token, livekitUrl=config.livekitUrl, callbacks={}) {
  const { Room, RoomEvent } = await livekit();
  if(!token) throw new Error("A LiveKit token is required.");
  const room=new Room({adaptiveStream:true,dynacast:true});
  room.on(RoomEvent.ParticipantConnected,p=>callbacks.onParticipantConnected?.(p));
  room.on(RoomEvent.ParticipantDisconnected,p=>callbacks.onParticipantDisconnected?.(p));
  room.on(RoomEvent.TrackSubscribed,(track,pub,participant)=>callbacks.onTrackSubscribed?.(track,pub,participant));
  room.on(RoomEvent.Disconnected,reason=>callbacks.onDisconnected?.(reason));
  await room.connect(livekitUrl,token);
  return room;
}

export async function listAudioDevices(){
  if(!navigator.mediaDevices?.enumerateDevices)return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput"||d.kind==="audiooutput");
}

export async function publishMicrophone(room,deviceId) {
  const { Track, ConnectionState, createLocalAudioTrack } = await livekit();
  if(!room || room.state!==ConnectionState.Connected) throw new Error("Radio connection is not active.");
  const track=await createLocalAudioTrack(deviceId?{deviceId:{exact:deviceId}}:undefined);
  await room.localParticipant.publishTrack(track,{name:"radio-microphone",source:Track.Source.Microphone,dtx:true,red:true});
  return track;
}

export async function unpublishMicrophone(room,track) {
  if(!room||!track)return;
  try{await room.localParticipant.unpublishTrack(track,true)}catch{}
}

export async function disconnectRadio(room){if(!room)return;await room.disconnect()}