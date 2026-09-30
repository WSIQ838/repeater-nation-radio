import { Room, RoomEvent, createLocalAudioTrack } from "livekit-client";
import { config } from "./config";

export async function connectRadio(token,callbacks={}){
  if(!token)throw new Error("A LiveKit token is required.");
  const room=new Room({adaptiveStream:true,dynacast:true});
  room.on(RoomEvent.ParticipantConnected,p=>callbacks.onParticipantConnected?.(p));
  room.on(RoomEvent.ParticipantDisconnected,p=>callbacks.onParticipantDisconnected?.(p));
  room.on(RoomEvent.TrackSubscribed,(track,pub,participant)=>callbacks.onTrackSubscribed?.(track,pub,participant));
  room.on(RoomEvent.Disconnected,reason=>callbacks.onDisconnected?.(reason));
  await room.connect(config.livekitUrl,token);
  return room;
}

export async function enableMicrophone(room,deviceId){
  const track=await createLocalAudioTrack(deviceId?{deviceId}:undefined);
  await track.setEnabled(false);
  await room.localParticipant.publishTrack(track);
  return track;
}

export async function disconnectRadio(room){if(!room)return;await room.disconnect();}