import {useState} from "react";
import {Power,Volume2,VolumeX,Home,Menu,Mic,ChevronUp,ChevronDown,ChevronLeft,ChevronRight,Users,RefreshCw,Phone,Settings,Radio} from "lucide-react";
import {ControlHead,FaceDisplay,KEYPAD,Knob,useFace} from "./ControlHead";

// Radio faces the user can pick from. Every face draws the same radio (useFace), so a
// new face only needs a layout: add it here and to FACES.
export const FACES=[
  {id:"control-head",label:"Dispatch control head",note:"Full keypad, ten softkeys, P1–P5"},
  {id:"handheld",label:"Portable handheld",note:"Top knobs, side PTT, paged softkeys"},
  {id:"mobile",label:"GMRS mobile",note:"Wide amber display, big channel number"},
];
export const DEFAULT_FACE="control-head";
const FACE_KEY="rn-face";
export const loadFace=()=>{try{const v=localStorage.getItem(FACE_KEY);return FACES.some(f=>f.id===v)?v:DEFAULT_FACE}catch{return DEFAULT_FACE}};
export const saveFace=v=>{try{localStorage.setItem(FACE_KEY,v)}catch{}};

const pttHandlers=(onDown,onUp)=>({
  onPointerDown:e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture?.(e.pointerId);onDown?.()},
  onPointerUp:()=>onUp?.(),onPointerCancel:()=>onUp?.(),onLostPointerCapture:()=>onUp?.(),onContextMenu:e=>e.preventDefault(),
});

function Handheld(p){
  const f=useFace(p);
  const {state,connected,muted,volume=7,ptt,onPower,onMute,onVolume,onPttDown,onPttUp}=p;
  const [page,setPage]=useState(0);
  // Three softkeys page through every menu item (bottom row first), like a portable.
  const keys=[...f.bottom,...f.top].filter(k=>k.label);
  const pages=Math.max(1,Math.ceil(keys.length/3)),at=page%pages;
  const row=[0,1,2].map(i=>keys[at*3+i]||{label:"",act:null});
  return <div className="hh" style={{"--apx-bright":0.55+f.brightness*0.15}}>
    <div className="hh-antenna"/>
    <div className="hh-top">
      <Knob className="hh-knob" angle={f.channelIndex*30} title="Channel (click or scroll to change)" onClick={()=>f.stepChannel(1)} onStep={f.stepChannel}/>
      <button type="button" className={"hh-power"+(connected?" on":"")} onClick={onPower} disabled={state==="connecting"} title={connected?"Power off (disconnect)":"Power on (connect)"}><Power size={13}/></button>
      <Knob className="hh-knob vol" angle={muted?-135:-135+volume*27} title={muted?"Volume (muted, click to unmute)":`Volume ${volume} (scroll to change, click to mute)`} onClick={onMute} onStep={dir=>onVolume?.(-dir)}/>
    </div>
    <div className="hh-body">
      <div className="hh-side">
        <button type="button" className={"hh-ptt"+(ptt?" pressed":"")} disabled={!connected} title="Push to talk (hold)" aria-label="Side PTT" {...pttHandlers(onPttDown,onPttUp)}>PTT</button>
        <button type="button" className="hh-sidekey" onClick={onMute} title={muted?"Unmute":"Monitor / mute"}>{muted?<VolumeX size={12}/>:<Volume2 size={12}/>}</button>
      </div>
      <div className="hh-face">
        <div className="hh-leds"><i className={f.ledTx?"tx":""}/><i className={f.ledRx?"rx":""}/><i className={f.ledCall?"call":""}/></div>
        <FaceDisplay p={p} f={f} className="apx-display hh-display" menus={false} softRow={row}/>
        <div className="hh-softkeys">{row.map((k,i)=><button type="button" key={i} className={"apx-soft "+(k.tone||"")} onClick={k.act||undefined} disabled={!k.act||k.disabled} aria-label={k.label||"Unused softkey"}/>)}</div>
        <div className="hh-navrow">
          <button type="button" className="hh-key" onClick={f.goHome} title="Home"><Home size={14}/></button>
          <div className="apx-nav">
            <button type="button" className="up" onClick={()=>f.stepZone(-1)} title="Previous zone"><ChevronUp size={13}/></button>
            <button type="button" className="left" onClick={()=>f.stepChannel(-1)} title="Previous channel"><ChevronLeft size={13}/></button>
            <button type="button" className="right" onClick={()=>f.stepChannel(1)} title="Next channel"><ChevronRight size={13}/></button>
            <button type="button" className="down" onClick={()=>f.stepZone(1)} title="Next zone"><ChevronDown size={13}/></button>
          </div>
          <button type="button" className="hh-key" onClick={()=>setPage(n=>n+1)} title="More softkeys" aria-label="More softkeys"><Menu size={14}/></button>
        </div>
        <div className="hh-keypad">{KEYPAD.map(([d,l])=><button type="button" key={d} className="apx-digit" onClick={()=>f.pressKey(d)}><b>{d}</b><small>{l}</small></button>)}</div>
        <div className="hh-grille"/>
        <div className="hh-brand">REPEATER NATION</div>
      </div>
    </div>
  </div>;
}

function Mobile(p){
  const f=useFace(p);
  const {state,connected,muted,volume=7,scanning,onPower,onMute,onVolume,onScan,onTab}=p;
  const fkeys=f.bottom.slice(0,4);
  return <div className="mob" style={{"--apx-bright":0.55+f.brightness*0.15}}>
    <div className="mob-row">
      <div className="mob-left">
        <Knob className="mob-knob" angle={muted?-135:-135+volume*27} label="VOL" title={muted?"Volume (muted, click to unmute)":`Volume ${volume} (scroll to change, click to mute)`} onClick={onMute} onStep={dir=>onVolume?.(-dir)}/>
        <button type="button" className={"mob-btn power"+(connected?" on":"")} onClick={onPower} disabled={state==="connecting"} title={connected?"Power off (disconnect)":"Power on (connect)"}><Power size={14}/></button>
      </div>
      <div className="mob-center">
        <div className="mob-brand"><Radio size={12}/> REPEATER NATION <span>GMRS</span><i className={f.ledTx?"tx":f.ledRx?"rx":f.ledCall?"call":""}/></div>
        <FaceDisplay p={p} f={f} className="apx-display mob-lcd" menus={false} softRow={fkeys}/>
        <div className="mob-fkeys">{fkeys.map((k,i)=><button type="button" key={i} className={"mob-btn f "+(k.tone||"")} onClick={k.act||undefined} disabled={!k.act||k.disabled} aria-label={k.label||"F"+(i+1)}>F{i+1}</button>)}</div>
      </div>
      <div className="mob-right">
        <Knob className="mob-knob" angle={f.channelIndex*30} label="CH" title="Channel (click or scroll to change)" onClick={()=>f.stepChannel(1)} onStep={f.stepChannel}/>
        <div className="mob-updown">
          <button type="button" className="mob-btn" onClick={()=>f.stepChannel(1)} title="Channel up"><ChevronUp size={14}/></button>
          <button type="button" className="mob-btn" onClick={()=>f.stepChannel(-1)} title="Channel down"><ChevronDown size={14}/></button>
        </div>
      </div>
    </div>
    <div className="mob-keys">
      <button type="button" className={"mob-btn"+(muted?" lit":"")} onClick={onMute}>{muted?"UNMUTE":"MON"}</button>
      <button type="button" className={"mob-btn"+(scanning?" lit":"")} onClick={onScan||undefined} disabled={!onScan}>SCAN</button>
      <button type="button" className="mob-btn" onClick={()=>f.stepZone(1)}>ZONE</button>
      <button type="button" className="mob-btn" onClick={()=>f.setView(v=>v==="who"?"home":"who")}><Users size={12}/> WHO</button>
      <button type="button" className="mob-btn" onClick={()=>f.setView(v=>v==="recent"?"home":"recent")}><RefreshCw size={12}/> RCNT</button>
      <button type="button" className="mob-btn" onClick={()=>onTab("calls")}><Phone size={12}/> CALL</button>
      <button type="button" className="mob-btn" onClick={f.goHome}><Home size={12}/></button>
      <button type="button" className="mob-btn" onClick={()=>onTab("settings")}><Settings size={12}/></button>
    </div>
  </div>;
}

export function RadioFace({face=DEFAULT_FACE,...p}){
  if(face==="handheld")return <Handheld {...p}/>;
  if(face==="mobile")return <Mobile {...p}/>;
  return <ControlHead {...p}/>;
}
