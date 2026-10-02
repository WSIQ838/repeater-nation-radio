import {useState} from "react";
import {Power,Volume2,VolumeX,Home,ChevronUp,ChevronDown,ChevronLeft,ChevronRight,Users,Phone,X,Sun,Mic,Radio,ListChecks,MoreHorizontal,RefreshCw,Bluetooth,Undo2,LayoutGrid,UserRound,Signal} from "lucide-react";
import {ControlHead,FaceDisplay,KEYPAD,Knob,useFace} from "./ControlHead";
import {STATUSES,statusClass} from "../lib/status";

// Radios the user can pick from. Every one draws the same radio (useFace: display
// views, softkey menus, keypad entry, mapped-button commands), so a new radio only
// needs a layout here and an entry in FACES. Names are generic on purpose.
export const FACES=[
  {id:"control-head",label:"Dispatch control head",note:"Full keypad, ten softkeys, P1–P5"},
  {id:"mobile-head",label:"Compact mobile head",note:"Four softkeys, round knob, keypad, 1–3 buttons"},
  {id:"keypad-portable",label:"Keypad portable",note:"Two softkeys, P1/P2, nav pad and keypad"},
  {id:"smart-portable",label:"Touchscreen portable",note:"Touch screen with status, zone/channel and messages"},
  {id:"smart-portable-p",label:"Touchscreen portable with P keys",note:"Touch screen plus P1–P6 buttons"},
];
export const DEFAULT_FACE="control-head";
const FACE_KEY="rn-face",RENAMED={handheld:"keypad-portable",mobile:"mobile-head"};
export const loadFace=()=>{try{let v=localStorage.getItem(FACE_KEY);v=RENAMED[v]||v;return FACES.some(f=>f.id===v)?v:DEFAULT_FACE}catch{return DEFAULT_FACE}};
export const saveFace=v=>{try{localStorage.setItem(FACE_KEY,v)}catch{}};

const pttHandlers=(onDown,onUp)=>({
  onPointerDown:e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture?.(e.pointerId);onDown?.()},
  onPointerUp:()=>onUp?.(),onPointerCancel:()=>onUp?.(),onLostPointerCapture:()=>onUp?.(),onContextMenu:e=>e.preventDefault(),
});
const SidePtt=({p})=><div className="pt-side">
  <button type="button" className={"pt-ptt"+(p.ptt?" pressed":"")} disabled={!p.connected} title="Push to talk (hold)" aria-label="Side PTT" {...pttHandlers(p.onPttDown,p.onPttUp)}>PTT</button>
  <button type="button" className="pt-sidekey" onClick={p.onMute} title={p.muted?"Unmute":"Monitor / mute"}>{p.muted?<VolumeX size={12}/>:<Volume2 size={12}/>}</button>
</div>;
const TopKnobs=({p,f,antenna="left"})=><div className={"pt-top antenna-"+antenna}>
  <div className="pt-antenna"/>
  <Knob className="pt-knob ch" angle={f.channelIndex*30} title="Channel (click or scroll to change)" onClick={()=>f.stepChannel(1)} onStep={f.stepChannel}/>
  <Knob className="pt-knob vol" angle={p.muted?-135:-135+(p.volume??7)*27} title={p.muted?"Volume (muted, click to unmute)":`Volume ${p.volume??7} (scroll to change, click to mute)`} onClick={p.onMute} onStep={dir=>p.onVolume?.(-dir)}/>
</div>;
const Nav=({f})=><div className="apx-nav">
  <button type="button" className="up" onClick={()=>f.stepZone(-1)} title="Previous zone"><ChevronUp size={13}/></button>
  <button type="button" className="left" onClick={()=>f.stepChannel(-1)} title="Previous channel"><ChevronLeft size={13}/></button>
  <button type="button" className="right" onClick={()=>f.stepChannel(1)} title="Next channel"><ChevronRight size={13}/></button>
  <button type="button" className="down" onClick={()=>f.stepZone(1)} title="Next zone"><ChevronDown size={13}/></button>
</div>;
const Keypad=({f,className})=><div className={className}>{KEYPAD.map(([d,l])=><button type="button" key={d} className="apx-digit" onClick={()=>f.pressKey(d)}><b>{d}</b><small>{l}</small></button>)}</div>;
// Softkeys page through every menu item (bottom row first) when a radio has fewer keys.
const usePaged=(f,n)=>{
  const [page,setPage]=useState(0);
  const keys=[...f.bottom,...f.top].filter(k=>k.label);
  const pages=Math.max(1,Math.ceil(keys.length/n)),at=page%pages;
  return [Array.from({length:n},(_,i)=>keys[at*n+i]||{label:"",act:null}),()=>setPage(x=>x+1)];
};
const press=k=>{if(k?.act&&!k.disabled)k.act()};

// Compact mobile control head (wide and short, as on a dash mount).
function MobileHead(p){
  const f=useFace(p);
  const {state,connected,muted,volume=7,onPower,onMute,onVolume,visibleChannels}=p;
  const [row,next]=usePaged(f,4);
  return <div className="mh" style={{"--apx-bright":0.55+f.brightness*0.15}}>
    <div className="mh-ear"/>
    <div className="mh-left">
      <button type="button" className={"mh-btn round power"+(connected?" on":"")} onClick={onPower} disabled={state==="connecting"} title={connected?"Power off (disconnect)":"Power on (connect)"}><Power size={14}/></button>
      <div className="mh-leds"><i className={f.ledTx?"tx":""}/><i className={f.ledRx?"rx":""}/><i className={f.ledCall?"call":""}/></div>
      <button type="button" className="mh-btn round" onClick={()=>f.setBrightness(b=>(b+1)%4)} title="Display brightness"><Sun size={13}/></button>
      <div className="mh-port" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
    </div>
    <div className="mh-center">
      <FaceDisplay p={p} f={f} className="apx-display mh-display" menus={false} softRow={row}/>
      <div className="mh-softkeys">{row.map((k,i)=><button type="button" key={i} className={"mh-btn soft "+(k.tone||"")} onClick={()=>press(k)} disabled={!k.act||k.disabled} aria-label={k.label||"Unused softkey"}/>)}</div>
    </div>
    <div className="mh-mid">
      <Knob className="mh-knob" angle={muted?-135:-135+volume*27} title={muted?"Volume (muted, click to unmute)":`Volume ${volume} (scroll to change, click to mute)`} onClick={onMute} onStep={dir=>onVolume?.(-dir)}/>
      <div className="mh-navrow"><Nav f={f}/></div>
    </div>
    <div className="mh-right">
      <div className="mh-pkeys">
        {[0,1,2].map(i=><button type="button" key={i} className="mh-btn pkey" onClick={()=>f.oneTouch(i)} title={visibleChannels[i]?`${i+1}: ${visibleChannels[i].name}`:String(i+1)}>{i+1}</button>)}
        <span className="mh-emerg" aria-hidden="true" title="Emergency (not used)"/>
      </div>
      <Keypad f={f} className="mh-keypad"/>
      <div className="mh-bottomkeys">
        <button type="button" className="mh-btn" onClick={f.goHome} title="Home"><Home size={13}/></button>
        <button type="button" className="mh-btn" onClick={next} title="More softkeys">•••</button>
        <button type="button" className="mh-btn" onClick={()=>{f.setView("home");f.setEntry("")}} title="Back"><X size={13}/></button>
      </div>
    </div>
    <div className="mh-ear"/>
  </div>;
}

// Keypad portable: two-softkey display, P1/P2, nav pad, OK and back/home, full keypad.
function KeypadPortable(p){
  const f=useFace(p);
  const [row,next]=usePaged(f,2);
  return <div className="pt kp" style={{"--apx-bright":0.55+f.brightness*0.15}}>
    <TopKnobs p={p} f={f} antenna="right"/>
    <div className="pt-body"><SidePtt p={p}/>
      <div className="pt-face">
        <div className="pt-brand">REPEATER NATION</div>
        <FaceDisplay p={p} f={f} className="apx-display kp-display" menus={false} softRow={row}/>
        <div className="kp-controls">
          <button type="button" className="pt-key" onClick={()=>press(row[0])} disabled={!row[0].act} title={row[0].label||"P1"}>P1</button>
          <Nav f={f}/>
          <button type="button" className="pt-key" onClick={()=>press(row[1])} disabled={!row[1].act} title={row[1].label||"P2"}>P2</button>
          <button type="button" className="pt-key" onClick={next} title="More menu items"><LayoutGrid size={12}/> OK</button>
          <button type="button" className="pt-key" onClick={f.goHome} title="Back / home"><Undo2 size={12}/><Home size={12}/></button>
        </div>
        <Keypad f={f} className="kp-keypad"/>
      </div>
    </div>
  </div>;
}

// Touchscreen portable. The screen is tappable cards, like a smart radio's home screen.
function SmartScreen({p,f}){
  const {channelName,zoneName,connected,ptt,muted,quality="unknown",participants,lastHeard=[],myStatus="",onStatus,onScan,scanning,onTab,onReplay,incoming,call,onAnswer,onDecline,onEndCall,state,onPower}=p;
  const [screen,setScreen]=useState("home");
  const b=f.banner,last=lastHeard[0];
  const clock=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  const back=<button type="button" className="ss-back" onClick={()=>setScreen("home")}><ChevronLeft size={14}/> Back</button>;
  return <div className="ss" style={{filter:"brightness(var(--apx-bright))"}}>
    <div className="ss-bar">
      <span className="ss-bars">{[1,2,3,4].map(n=><i key={n} className={n<=f.bars?"on":""}/>)}</span>
      <span>{connected?(ptt?"TX":"RX"):"OFF"}</span>{scanning&&<span>SCAN</span>}
      <span className="ss-right">{muted?<VolumeX size={12}/>:<Volume2 size={12}/>}<Bluetooth size={12}/>{clock}</span>
    </div>
    {screen==="status"?<div className="ss-list">{back}<strong>My Status</strong>
      {STATUSES.map(s=><button type="button" key={s} className={"ss-item "+(s===myStatus?"on ":"")+statusClass(s)} onClick={()=>{onStatus?.(s===myStatus?"":s);setScreen("home")}}>{s}</button>)}
    </div>:screen==="more"?<div className="ss-list">{back}<strong>More</strong>
      <button type="button" className="ss-item" onClick={()=>setScreen("who")}><Users size={13}/> Who's On ({participants.length})</button>
      <button type="button" className="ss-item" onClick={()=>setScreen("recent")}><RefreshCw size={13}/> Recent</button>
      <button type="button" className="ss-item" onClick={onPower} disabled={state==="connecting"}><Power size={13}/> {connected?"Radio off":"Radio on"}</button>
      <button type="button" className="ss-item" onClick={()=>onTab("settings")}><ListChecks size={13}/> Setup</button>
    </div>:screen==="who"?<div className="ss-list">{back}<strong>Who's On</strong>
      {participants.length?participants.map(x=>{let info={};try{info=x.metadata?JSON.parse(x.metadata):{}}catch{}const st=x.attributes?.status;return <div className="ss-item" key={x.identity}><UserRound size={13}/> {info.callsign||info.displayName||x.name||x.identity}{st&&<em className={"status-chip "+statusClass(st)}>{st}</em>}</div>}):<div className="ss-dim">{connected?"Nobody else on channel":"Not connected"}</div>}
    </div>:screen==="recent"?<div className="ss-list">{back}<strong>Recent</strong>
      {lastHeard.length?lastHeard.slice(0,6).map(x=><button type="button" className="ss-item" key={x.id} onClick={()=>onReplay?.(x.id)} disabled={!x.url}>{x.name}<small>{new Date(x.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} · {Math.max(1,Math.round(x.ms/1000))}s</small></button>):<div className="ss-dim">Nothing heard yet</div>}
    </div>:<>
      <button type="button" className="ss-card ss-status" onClick={()=>setScreen("status")}><small>My Status</small><strong className={myStatus?statusClass(myStatus):""}>{myStatus||"Set status"}</strong></button>
      <div className="ss-card ss-channel">
        <div className={"ss-strip "+b.tone}/>
        <div className="ss-chinfo">
          <button type="button" className="ss-zone" onClick={()=>f.stepZone(1)} title="Next zone">{zoneName||"Zone"}</button>
          <strong>{channelName}</strong>
          <small className={"ss-activity "+b.tone}>{b.title}{b.sub?" · "+b.sub:""}</small>
        </div>
        <div className="ss-chbtns">
          <button type="button" onClick={()=>f.stepChannel(1)} title="Next channel"><ChevronUp size={15}/></button>
          <button type="button" onClick={()=>f.stepChannel(-1)} title="Previous channel"><ChevronDown size={15}/></button>
        </div>
      </div>
      <div className="ss-tiles">
        <button type="button" onClick={onScan||undefined} disabled={!onScan} className={scanning?"on":""}><ListChecks size={15}/>Scan</button>
        <button type="button" onClick={()=>onTab("calls")}><Users size={15}/>Contacts</button>
        <button type="button" onClick={()=>setScreen("more")}><MoreHorizontal size={15}/>More</button>
      </div>
      {incoming?<div className="ss-card ss-msg call"><strong>Call from {incoming.caller_display_name||incoming.caller_callsign||"Member"}</strong>
        <div className="ss-msgbtns"><button type="button" className="go" onClick={onAnswer}><Phone size={13}/> Answer</button><button type="button" className="stop" onClick={onDecline}>Decline</button></div></div>
      :call?<div className="ss-card ss-msg call"><strong>{p.callState==="calling"?"Calling…":"Call connected"}</strong><div className="ss-msgbtns"><button type="button" className="stop" onClick={onEndCall}>End call</button></div></div>
      :<div className="ss-card ss-msg"><strong>{last?last.name:"No recent traffic"}</strong><small>{last?`Heard ${new Date(last.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} · ${Math.max(1,Math.round(last.ms/1000))}s`:"Transmissions you hear show up here"}</small>
        <div className="ss-msgbtns"><button type="button" onClick={()=>onReplay?.(last?.id)} disabled={!last?.url}><RefreshCw size={12}/> Replay</button><button type="button" onClick={()=>setScreen("recent")}>All recent</button></div></div>}
    </>}
  </div>;
}

function SmartPortable({pkeys=false,...p}){
  const f=useFace(p);
  return <div className={"pt smart"+(pkeys?" with-p":"")} style={{"--apx-bright":0.55+f.brightness*0.15}}>
    <TopKnobs p={p} f={f} antenna="left"/>
    <div className="pt-body"><SidePtt p={p}/>
      <div className="pt-face">
        <div className="pt-logo"><Radio size={13}/></div>
        <SmartScreen p={p} f={f}/>
        <button type="button" className="smart-home" onClick={f.goHome} title="Home" aria-label="Home"/>
        {pkeys&&<div className="smart-pkeys">{[0,1,2,3,4,5].map(i=>i<5
          ?<button type="button" key={i} className="pt-key" onClick={()=>f.oneTouch(i)} title={p.visibleChannels[i]?`P${i+1}: ${p.visibleChannels[i].name}`:`P${i+1}`}>P{i+1}</button>
          :<button type="button" key={i} className="pt-key" onClick={p.onMute} title="P6: mute / unmute">P6</button>)}</div>}
        {!pkeys&&<div className="smart-chin"/>}
      </div>
    </div>
  </div>;
}

export function RadioFace({face=DEFAULT_FACE,...p}){
  if(face==="mobile-head")return <MobileHead {...p}/>;
  if(face==="keypad-portable")return <KeypadPortable {...p}/>;
  if(face==="smart-portable")return <SmartPortable {...p}/>;
  if(face==="smart-portable-p")return <SmartPortable pkeys {...p}/>;
  return <ControlHead {...p}/>;
}
