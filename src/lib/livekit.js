import { Room, RoomEvent, Track, ConnectionState, createLocalAudioTrack } from "livekit-client";
import { config } from "./config";

export async function connectRadio(token, livekitUrl=config.livekitUrl, callbacks={}) {
  if(!token) throw new Error("A LiveKit token is required.");
  const room=new Room({adaptiveStream:true,dynacast:true});
  room.on(RoomEvent.ParticipantConnected,p=>callbacks.onParticipantConnected?.(p));
  room.on(RoomEvent.ParticipantDisconnected,p=>callbacks.onParticipantDisconnected?.(p));
  room.on(RoomEvent.TrackSubscribed,(track,pub,participant)=>callbacks.onTrackSubscribed?.(track,pub,participant));
  room.on(RoomEvent.Disconnected,reason=>callbacks.onDisconnected?.(reason));
  await room.connect(livekitUrl,token);
  return room;
}

export async function listAudioDevices(){\n  if(!navigator.mediaDevices?.enumerateDevices)return [];\n  return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput"||d.kind==="audiooutput");\n}\n\nexport async function publishMicrophone(room,deviceId) {
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