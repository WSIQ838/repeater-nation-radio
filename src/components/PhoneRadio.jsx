import {useEffect,useRef,useState} from "react";
import {ChevronLeft,ChevronRight,Phone,PhoneOff,Power,Radio,RefreshCw,ScanLine,Settings,Users,Volume2,VolumeX,Wifi,History,List} from "lucide-react";
import {photoBoxes,useFace} from "./ControlHead";
import {clock,hhmm,pttHandlers,secs} from "./TouchHandheld";
import {STATUSES,statusClass} from "../lib/status";

// Phones from Sean's photos, with the radio running on the screen as a push-to-talk
// app. The phone body is an SVG in the photo's own pixels; the side buttons work like
// the phone's own (volume up and down change the real volume, the side key is PTT)
// and the app fills the screen box.

const who=x=>{let info={};try{info=x.metadata?JSON.parse(x.metadata):{}}catch{}return info.callsign||info.displayName||x.name||x.identity};

// Press-and-hold repeat for the volume buttons, reading the latest onVolume.
function useVolumeButtons(onVolume){
  const ref=useRef(onVolume),timer=useRef(null);ref.current=onVolume;
  const stop=()=>{clearTimeout(timer.current);clearInterval(timer.current)};
  useEffect(()=>stop,[]);
  return dir=>({
    onPointerDown:e=>{if(e.pointerType==="mouse"&&e.button!==0)return;ref.current?.(dir);stop();timer.current=setTimeout(()=>{timer.current=setInterval(()=>ref.current?.(dir),160)},420)},
    onPointerUp:stop,onPointerLeave:stop,onPointerCancel:stop,onContextMenu:e=>e.preventDefault(),
    onKeyDown:e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();ref.current?.(dir)}},
  });
}

// The phone's volume pop-up: shows for a moment whenever the level or mute changes.
function VolumeHud({volume,muted,side="left"}){
  const [show,setShow]=useState(false),born=useRef(Date.now());
  // Levels loaded while the app starts up don't pop it up; only presses do.
  useEffect(()=>{if(Date.now()-born.current<1500)return;setShow(true);const id=setTimeout(()=>setShow(false),1400);return()=>clearTimeout(id)},[volume,muted]);
  return <div className={"ph-hud "+side+(show?" show":"")} aria-hidden={!show} role="status" title={muted?"Muted":`Volume ${volume}`}>
    <div className="ph-hud-bar"><i style={{height:(muted?0:volume*10)+"%"}}/></div>
    {muted?<VolumeX size={13}/>:<Volume2 size={13}/>}
  </div>;
}

function Battery(){return <svg className="ph-batt" viewBox="0 0 25 12" aria-hidden="true"><rect x=".6" y=".6" width="21" height="10.8" rx="3" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.1"/><rect x="2.2" y="2.2" width="16" height="7.6" rx="1.6" fill="currentColor"/><path d="M23.2 4v4a2 2 0 0 0 0-4Z" fill="currentColor" fillOpacity=".5"/></svg>}

// The push-to-talk app on the phone's screen.
export function PhoneApp({p,f,variant="iphone"}){
  const {channelName,channelNumber,zoneName,zones=[],zoneId,visibleChannels=[],channelId,state,connected,ptt,muted,callsign,displayName,participants=[],
    incoming,call,callState,onPower,onMute,onChannel,onZone,onTab,onAnswer,onDecline,onEndCall,lastHeard=[],onReplay,scanning=false,onScan,myStatus="",onStatus,onPttDown,onPttUp,volume=7}=p;
  const [screen,setScreen]=useState("home");
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(id)},[]);
  // Mapped "home", "who" and "recent" buttons drive the app too.
  useEffect(()=>{if(f.view==="who"||f.view==="recent")setScreen(f.view);else if(f.view==="home")setScreen(s=>s==="who"||s==="recent"?"home":s)},[f.view]);
  const b=f.banner;
  const go=s=>{setScreen(s);if(s==="home")f.goHome()};
  const list=(title,items)=><div className="ph-page">
    <div className="ph-pagehead"><button type="button" className="ph-back" onClick={()=>go("home")} aria-label="Back"><ChevronLeft size={18}/>Radio</button><strong>{title}</strong></div>
    <div className="ph-list">{items}</div>
  </div>;
  let body;
  if(screen==="channels")body=list("Channels",<>
    <div className="ph-seg">{zones.map(z=><button type="button" key={z.id} className={z.id===zoneId?"on":""} onClick={()=>onZone?.(z.id)}>{z.name}</button>)}</div>
    {visibleChannels.length?visibleChannels.map(c=><button type="button" key={c.id} className={"ph-row"+(c.id===channelId?" on":"")} onClick={()=>{onChannel?.(c.id);go("home")}}><b>{c.number??""}</b><span>{c.name}</span>{c.id===channelId&&<em>Tuned</em>}</button>)
      :<div className="ph-dim">No channels in this zone</div>}
  </>);
  else if(screen==="who")body=list("Who's On",participants.length?participants.map(x=><div className="ph-row" key={x.identity}><Users size={14}/><span>{who(x)}</span>{x.attributes?.status&&<em className={"status-chip "+statusClass(x.attributes.status)}>{x.attributes.status}</em>}</div>)
    :<div className="ph-dim">{connected?"Nobody else on this channel":"Radio is off"}</div>);
  else if(screen==="recent")body=list("Recent",lastHeard.length?lastHeard.slice(0,12).map(x=><button type="button" className="ph-row" key={x.id} onClick={()=>onReplay?.(x.id)} disabled={!x.url}><RefreshCw size={13}/><span>{x.name}</span><small>{hhmm(x.at)} · {secs(x.ms)}</small></button>)
    :<div className="ph-dim">Nothing heard yet</div>);
  else if(screen==="status")body=list("My Status",STATUSES.map(s=><button type="button" key={s} className={"ph-row "+(s===myStatus?"on ":"")+statusClass(s)} onClick={()=>{onStatus?.(s===myStatus?"":s);go("home")}}><span>{s}</span>{s===myStatus&&<em>Set</em>}</button>));
  else{
    const last=lastHeard[0];
    const pttLabel=!connected?(state==="connecting"?"Connecting…":"Radio off"):ptt?"Talking":b.tone==="rx"?"Receiving":"Hold to talk";
    body=<div className="ph-home">
      <div className="ph-apphead">
        <div><strong>REPEATER NATION</strong><small>{displayName||callsign||"Member"}{callsign&&displayName?" · "+callsign:""}</small></div>
        <button type="button" className={"ph-power"+(connected?" on":"")} onClick={onPower} disabled={state==="connecting"} title={connected?"Radio off":"Radio on"} aria-label={connected?"Radio off":"Radio on"}><Power size={16} strokeWidth={2.6}/></button>
      </div>
      <div className="ph-zone">
        <button type="button" onClick={()=>f.stepZone(-1)} aria-label="Previous zone"><ChevronLeft size={16}/></button>
        <span>{zoneName||"All Zones"}</span>
        <button type="button" onClick={()=>f.stepZone(1)} aria-label="Next zone"><ChevronRight size={16}/></button>
      </div>
      <div className="ph-chan">
        <button type="button" className="ph-step" onClick={()=>f.stepChannel(-1)} aria-label="Previous channel"><ChevronLeft size={22}/></button>
        <button type="button" className="ph-channame" onClick={()=>setScreen("channels")} title="Choose channel"><strong>{channelName||"No channel"}</strong><small>CH {channelNumber??"--"}</small></button>
        <button type="button" className="ph-step" onClick={()=>f.stepChannel(1)} aria-label="Next channel"><ChevronRight size={22}/></button>
      </div>
      <div className={"ph-activity "+b.tone}><i/>{b.title}{b.sub?<span> · {b.sub}</span>:null}</div>
      {incoming?<div className="ph-callcard">
        <strong>Call from {incoming.caller_display_name||incoming.caller_callsign||"Member"}</strong>
        <div><button type="button" className="stop" onClick={onDecline}><PhoneOff size={15}/>Decline</button><button type="button" className="go" onClick={onAnswer}><Phone size={15}/>Answer</button></div>
      </div>:call?<div className="ph-callcard">
        <strong>{callState==="calling"?"Calling…":"Call connected"} · {call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</strong>
        <div><button type="button" className="stop" onClick={onEndCall}><PhoneOff size={15}/>End call</button></div>
      </div>:<button type="button" className={"ph-ptt"+(ptt?" tx":b.tone==="rx"?" rx":"")} disabled={!connected} aria-label="Push to talk" title="Push to talk (hold)" {...pttHandlers(onPttDown,onPttUp)}>
        <span><Radio size={30} strokeWidth={2.2}/>{pttLabel}</span>
      </button>}
      <div className="ph-actions">
        <button type="button" className={scanning?"on":""} onClick={onScan||undefined} disabled={!onScan}><ScanLine size={17}/>{scanning?"Scan on":"Scan"}</button>
        <button type="button" className={muted?"on":""} onClick={onMute}>{muted?<VolumeX size={17}/>:<Volume2 size={17}/>}{muted?"Muted":`Vol ${volume}`}</button>
        <button type="button" onClick={f.replayLast}><RefreshCw size={17}/>Replay</button>
        <button type="button" className={myStatus?statusClass(myStatus):""} onClick={()=>setScreen("status")}><Users size={17}/>{myStatus||"Status"}</button>
      </div>
      <button type="button" className="ph-last" onClick={()=>setScreen("recent")}>
        <History size={14}/><span>{last?<>{last.name}<small> · {hhmm(last.at)} · {secs(last.ms)}</small></>:"No traffic heard yet"}</span><ChevronRight size={14}/>
      </button>
    </div>;
  }
  const tabs=[["home","Radio",Radio],["channels","Channels",List],["who","Who's On",Users],["recent","Recent",History]];
  return <div className={"ph-app "+variant} style={{filter:"brightness(var(--apx-bright))"}}>
    <div className="ph-statusbar">
      <span className="ph-time">{clock(now)}</span>
      <span className="ph-sys">
        {f.ledTx?<em className="tx">TX</em>:f.ledRx?<em className="rx">RX</em>:null}
        <span className="ph-bars" title={connected?"Signal":"No signal"}>{[1,2,3,4].map(n=><i key={n} className={n<=f.bars?"on":""}/>)}</span>
        <Wifi size={13} strokeWidth={2.6}/><Battery/>
      </span>
    </div>
    <div className="ph-body">{body}</div>
    <nav className="ph-tabs">
      {tabs.map(([id,label,Ic])=><button type="button" key={id} className={screen===id?"on":""} onClick={()=>go(id)}><Ic size={19}/>{label}</button>)}
      <button type="button" onClick={()=>onTab("settings")}><Settings size={19}/>Settings</button>
    </nav>
    {variant==="galaxy"&&<nav className="ph-navbar" aria-label="Phone navigation">
      <button type="button" onClick={()=>go("recent")} aria-label="Recent apps" title="Recent"><svg viewBox="0 0 16 16"><path d="M4 3v10M8 3v10M12 3v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/></svg></button>
      <button type="button" onClick={()=>go("home")} aria-label="Home" title="Home"><svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="3.2" stroke="currentColor" strokeWidth="1.6" fill="none"/></svg></button>
      <button type="button" onClick={()=>go("home")} aria-label="Back" title="Back"><svg viewBox="0 0 16 16"><path d="M10.5 3 5.5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg></button>
    </nav>}
    {f.notice&&<div className="ph-toast" role="status">{f.notice}</div>}
  </div>;
}

// iPhone X style (Sean's photo, 672×1212: phone from x 57–611, y 38–1160, screen
// x 90–577, y 70.7–1125.7). Left side: ring/silent switch (mute), volume up and down;
// right side: side button (PTT).
const IK=0.62,IX=46,IY=33,IW=574,IH=1132;
const IB=photoBoxes(IX,IY,IK);
function IPhoneBody(){
  return <svg className="ph-svg" viewBox={`${IX} ${IY} ${IW} ${IH}`} aria-hidden="true">
    <defs>
      <linearGradient id="ipSteel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3a3a3d"/><stop offset=".012" stopColor="#f4f4f6"/><stop offset=".03" stopColor="#9c9ca1"/><stop offset=".5" stopColor="#c9c9cd"/><stop offset=".97" stopColor="#9c9ca1"/><stop offset=".988" stopColor="#f4f4f6"/><stop offset="1" stopColor="#3a3a3d"/></linearGradient>
      <linearGradient id="ipSteelV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fafafa"/><stop offset=".008" stopColor="#8e8e93"/><stop offset=".03" stopColor="#d4d4d8" stopOpacity="0"/><stop offset=".97" stopColor="#d4d4d8" stopOpacity="0"/><stop offset=".992" stopColor="#8e8e93"/><stop offset="1" stopColor="#f2f2f2"/></linearGradient>
      <linearGradient id="ipGlassEdge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7d7d82"/><stop offset=".06" stopColor="#3b3b3e"/><stop offset=".94" stopColor="#3b3b3e"/><stop offset="1" stopColor="#7d7d82"/></linearGradient>
      <linearGradient id="ipKey" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4a4a4e"/><stop offset=".4" stopColor="#e9e9ec"/><stop offset="1" stopColor="#8a8a8f"/></linearGradient>
    </defs>
    {/* side keys sit behind the frame edge */}
    <rect x="52.4" y="189" width="7" height="42" rx="2.6" fill="url(#ipKey)" stroke="#2a2a2c" strokeWidth=".8"/>
    <rect x="52.4" y="269" width="7" height="80" rx="2.6" fill="url(#ipKey)" stroke="#2a2a2c" strokeWidth=".8"/>
    <rect x="52.4" y="371" width="7" height="80" rx="2.6" fill="url(#ipKey)" stroke="#2a2a2c" strokeWidth=".8"/>
    <rect x="608.6" y="295" width="6" height="132" rx="2.4" fill="url(#ipKey)" stroke="#2a2a2c" strokeWidth=".8" transform="scale(-1 1) translate(-1223.2 0)"/>
    {/* stainless frame, glass edge and black border */}
    <rect x="57" y="38" width="554" height="1122" rx="76" fill="#1c1c1e"/>
    <rect x="58.5" y="39.5" width="551" height="1119" rx="74.5" fill="url(#ipSteel)"/>
    <rect x="58.5" y="39.5" width="551" height="1119" rx="74.5" fill="url(#ipSteelV)"/>
    <rect x="66" y="47" width="536" height="1104" rx="67" fill="#232325"/>
    <rect x="68" y="49" width="532" height="1100" rx="65" fill="url(#ipGlassEdge)"/>
    <rect x="77.5" y="58" width="513" height="1081" rx="56" fill="#050505"/>
    {/* antenna bands */}
    {[[57.5,146,8,4.5],[602.5,146,8,4.5],[57.5,1048,8,4.5],[602.5,1048,8,4.5]].map(([x,y,w,h],i)=><rect key={i} x={x} y={y} width={w} height={h} fill="#7a7a7f" opacity=".75"/>)}
  </svg>;
}

export function IPhoneRadio(p){
  const f=useFace(p);
  const {at}=IB;
  const {connected,ptt,muted,volume=7,onMute,onVolume,onPttDown,onPttUp}=p;
  const vol=useVolumeButtons(onVolume);
  return <div className="ph iphone" style={{"--apx-bright":0.55+f.brightness*0.15,width:IW*IK,height:IH*IK}}>
    <div style={at(IX,IY,IX+IW,IY+IH)}><IPhoneBody/></div>
    <div className="ph-screen iphone" style={at(90,70.7,577,1125.7)}>
      <PhoneApp p={p} f={f} variant="iphone"/>
      <div className="ph-notch" aria-hidden="true"><svg viewBox="0 0 273 39" preserveAspectRatio="none"><path d="M0 0h273c-7 0-8.6 3.6-8.6 9.4C264.4 27 254 38.4 236 38.4H37C19 38.4 8.6 27 8.6 9.4 8.6 3.6 7 0 0 0Z" fill="#000"/><rect x="103" y="10" width="67" height="6" rx="3" fill="#1b1b1d"/><circle cx="197" cy="12.6" r="5.4" fill="#0d1726"/><circle cx="197" cy="12.6" r="2.4" fill="#2b4a7a"/></svg></div>
      <i className="ph-homebar" aria-hidden="true"/>
      <VolumeHud volume={volume} muted={muted}/>
    </div>
    <button type="button" className={"ph-switch"+(muted?" on":"")} style={at(46,186,60,234)} onClick={onMute} title={muted?"Ring/silent switch: silent (click to unmute)":"Ring/silent switch (click to mute)"} aria-label={muted?"Unmute":"Mute"}><i/></button>
    <button type="button" className="ph-side" style={at(46,269,60,349)} {...vol(1)} title={`Volume up (${muted?"muted":volume})`} aria-label="Volume up"/>
    <button type="button" className="ph-side" style={at(46,371,60,451)} {...vol(-1)} title={`Volume down (${muted?"muted":volume})`} aria-label="Volume down"/>
    <button type="button" className={"ph-side ph-pttkey"+(ptt?" pressed":"")} style={at(607,295,620,427)} disabled={!connected} title="Side button: push to talk (hold)" aria-label="Side PTT" {...pttHandlers(onPttDown,onPttUp)}/>
  </div>;
}

// Galaxy A54 style (Sean's photo, 750×750: phone from x 213.75–534.5, y 45–705.5,
// screen x 230.5–517, y 63–681 with a centred punch-hole camera). Right side: volume
// rocker (top half up, bottom half down) and the side key (PTT).
const GK=1.06,GX=208,GY=40,GW=332,GH=672;
const GB=photoBoxes(GX,GY,GK);
function GalaxyBody(){
  return <svg className="ph-svg" viewBox={`${GX} ${GY} ${GW} ${GH}`} aria-hidden="true">
    <defs>
      <linearGradient id="gxFrame" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1f1f21"/><stop offset=".012" stopColor="#6d6d72"/><stop offset=".03" stopColor="#3a3a3d"/><stop offset=".97" stopColor="#3a3a3d"/><stop offset=".988" stopColor="#6d6d72"/><stop offset="1" stopColor="#1f1f21"/></linearGradient>
      <linearGradient id="gxFrameV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a7a7f" stopOpacity=".7"/><stop offset=".012" stopColor="#3a3a3d" stopOpacity="0"/><stop offset=".988" stopColor="#3a3a3d" stopOpacity="0"/><stop offset="1" stopColor="#7a7a7f" stopOpacity=".7"/></linearGradient>
      <linearGradient id="gxKey" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2a2a2d"/><stop offset=".5" stopColor="#6e6e73"/><stop offset="1" stopColor="#3a3a3e"/></linearGradient>
    </defs>
    <rect x="532" y="211" width="4.4" height="83" rx="1.8" fill="url(#gxKey)"/>
    <rect x="532" y="326" width="4.4" height="40" rx="1.8" fill="url(#gxKey)"/>
    <rect x="213.75" y="45" width="320.75" height="660.5" rx="38" fill="#18181a"/>
    <rect x="214.75" y="46" width="318.75" height="658.5" rx="37" fill="url(#gxFrame)"/>
    <rect x="214.75" y="46" width="318.75" height="658.5" rx="37" fill="url(#gxFrameV)"/>
    <rect x="218.5" y="49.5" width="311.25" height="651.5" rx="33.5" fill="#5b5b60"/>
    <rect x="219.5" y="50.5" width="309.25" height="649.5" rx="32.5" fill="#030303"/>
    <path d="M322,47.6 H426" stroke="#202022" strokeWidth="1.2"/>
  </svg>;
}

export function GalaxyRadio(p){
  const f=useFace(p);
  const {at}=GB;
  const {connected,ptt,muted,volume=7,onVolume,onPttDown,onPttUp}=p;
  const vol=useVolumeButtons(onVolume);
  return <div className="ph galaxy" style={{"--apx-bright":0.55+f.brightness*0.15,width:GW*GK,height:GH*GK}}>
    <div style={at(GX,GY,GX+GW,GY+GH)}><GalaxyBody/></div>
    <div className="ph-screen galaxy" style={at(230.5,63,517,681)}>
      <PhoneApp p={p} f={f} variant="galaxy"/>
      <i className="ph-punch" aria-hidden="true"/>
      <VolumeHud volume={volume} muted={muted} side="right"/>
    </div>
    <button type="button" className="ph-side" style={at(530,211,542,252.5)} {...vol(1)} title={`Volume up (${muted?"muted":volume})`} aria-label="Volume up"/>
    <button type="button" className="ph-side" style={at(530,252.5,542,294)} {...vol(-1)} title={`Volume down (${muted?"muted":volume})`} aria-label="Volume down"/>
    <button type="button" className={"ph-side ph-pttkey"+(ptt?" pressed":"")} style={at(530,326,542,366)} disabled={!connected} title="Side key: push to talk (hold)" aria-label="Side PTT" {...pttHandlers(onPttDown,onPttUp)}/>
  </div>;
}
