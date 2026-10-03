import {useEffect,useState} from "react";
import {Maximize2,Mic,Power,Volume2,VolumeX,Minus,Plus,ChevronLeft,ChevronRight,PhoneCall,PhoneOff} from "lucide-react";

// Compact always-on-top radio: channel, who's talking, signal, PTT and the few
// controls used most. Everything else is one click away in the full radio.
const QUALITY_BARS={excellent:4,good:3,poor:1,lost:0,unknown:4};

export function MiniRadio({
  channelName,channelNumber,zoneName,state,connected,ptt,muted,quality="unknown",onAir,scanning,scanActive,flash,volume,incoming,
  onDown,onUp,onChannel,onMute,onVolume,onPower,onExpand,onAnswer,onDecline,
}){
  const [notice,setNotice]=useState("");
  useEffect(()=>{document.body.classList.add("mini-mode");return()=>document.body.classList.remove("mini-mode")},[]);
  useEffect(()=>{if(!flash?.text)return;setNotice(flash.text);const id=setTimeout(()=>setNotice(""),1600);return()=>clearTimeout(id)},[flash]);
  const bars=connected?(QUALITY_BARS[quality]??4):state==="connecting"?1:0;
  const status=state==="transmitting"?"Transmitting":onAir?"RX · "+onAir.name:scanActive?"Scan · "+scanActive.name+(scanActive.talker?" · "+scanActive.talker:""):state==="connecting"?"Connecting…":connected?(scanning?"Scanning":"Listening"):"Off";
  const tone=state==="transmitting"?"tx":onAir||scanActive?.talker?"rx":"";
  const release=()=>onUp();
  return <div className={"mini-radio "+tone}>
    <div className="mini-top">
      <span className="mini-zone">{zoneName||"Radio"}</span>
      <span className="mini-bars" title={connected?"Connection: "+quality:"No signal"}>{[1,2,3,4].map(n=><i key={n} className={n<=bars?"on":""}/>)}</span>
      <button type="button" className="mini-icon" onClick={onExpand} title="Full radio" aria-label="Full radio"><Maximize2 size={15}/></button>
    </div>
    <div className="mini-channel">
      <button type="button" className="mini-icon" onClick={()=>onChannel(-1)} title="Channel down" aria-label="Channel down"><ChevronLeft size={18}/></button>
      <div><strong>{channelName}</strong><small>{channelNumber!=null?"CH "+channelNumber:""}</small></div>
      <button type="button" className="mini-icon" onClick={()=>onChannel(1)} title="Channel up" aria-label="Channel up"><ChevronRight size={18}/></button>
    </div>
    <div className="mini-status">{incoming?"Call · "+(incoming.caller_display_name||incoming.caller_callsign||"Member"):notice||status}</div>
    {incoming?<div className="mini-controls">
      <button type="button" className="primary" onClick={onAnswer}><PhoneCall size={15}/> Answer</button>
      <button type="button" className="danger" onClick={onDecline}><PhoneOff size={15}/> Decline</button>
    </div>:<div className="mini-controls">
      <button type="button" className={"mini-icon"+(connected?" lit":"")} onClick={onPower} disabled={state==="connecting"} title={connected?"Disconnect":"Connect"} aria-label={connected?"Disconnect":"Connect"}><Power size={16}/></button>
      <button type="button" className="mini-icon" onClick={onMute} title={muted?"Unmute":"Mute"} aria-label={muted?"Unmute":"Mute"}>{muted?<VolumeX size={16}/>:<Volume2 size={16}/>}</button>
      <button type="button" className={ptt?"mini-ptt pressed":"mini-ptt"} disabled={!connected}
        onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture?.(e.pointerId);onDown()}} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={e=>e.preventDefault()}>
        <Mic size={16}/> PTT
      </button>
      <button type="button" className="mini-icon" onClick={()=>onVolume(-1)} title="Volume down" aria-label="Volume down"><Minus size={16}/></button>
      <span className="mini-vol">{volume}</span>
      <button type="button" className="mini-icon" onClick={()=>onVolume(1)} title="Volume up" aria-label="Volume up"><Plus size={16}/></button>
    </div>}
  </div>
}
