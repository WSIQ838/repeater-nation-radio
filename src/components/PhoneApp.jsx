import {useEffect,useRef,useState} from "react";
import {ChevronLeft,ListChecks,Power,Radio,RefreshCw,UserRound,Users,Volume2,VolumeX,Minus,Plus,PhoneCall,PhoneOff,LogOut} from "lucide-react";
import {ChanLine} from "./ChanLine";
import {PHONE_FACES,PhoneFaceBody} from "./PhoneFaces";
import {zoneLabel} from "../lib/labels";
import {STATUSES,statusClass} from "../lib/status";

// The Android and iPhone app (and a phone-sized browser) starts on a full-screen version of
// the touch handheld's (APX N70) display, plus a big PTT key. More › Radio switches to one of
// the phone-only looks in PhoneFaces.jsx (the desktop radio faces stay on the desktop).
// __MOBILE__ is set when Tauri builds for Android or iOS.
export const IS_PHONE=(typeof __MOBILE__!=="undefined"&&__MOBILE__)||(typeof navigator!=="undefined"&&/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||""));

// The phone's own screen, then the phone-only looks. Remembered apart from the desktop pick.
export const PHONE_SCREEN="phone";
const PHONE_FACE_KEY="rn-phone-face";
export const loadPhoneFace=()=>{try{const v=localStorage.getItem(PHONE_FACE_KEY);return PHONE_FACES.some(f=>f.id===v)?v:PHONE_SCREEN}catch{return PHONE_SCREEN}};
export const savePhoneFace=v=>{try{localStorage.setItem(PHONE_FACE_KEY,v)}catch{}};

const hhmm=t=>new Date(t).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
const clock=t=>{const d=new Date(t);return (d.getHours()%12||12)+":"+String(d.getMinutes()).padStart(2,"0")};
const secs=ms=>Math.max(1,Math.round(ms/1000))+"s";
const memberInfo=p=>{try{return p?.metadata?JSON.parse(p.metadata):{}}catch{return {}}};
const memberName=p=>{const i=memberInfo(p);return i.callsign||i.displayName||p?.name||p?.identity||"Member"};

// Keep the screen on while the radio is on, so the phone doesn't sleep mid-conversation.
function useScreenAwake(on){
  useEffect(()=>{
    if(!on||!navigator.wakeLock)return;
    let lock=null,alive=true;
    const take=()=>{if(alive&&document.visibilityState==="visible")navigator.wakeLock.request("screen").then(l=>{if(alive)lock=l;else l.release()}).catch(()=>{})};
    take();document.addEventListener("visibilitychange",take);
    return()=>{alive=false;document.removeEventListener("visibilitychange",take);lock?.release?.().catch(()=>{})};
  },[on]);
}

function PttButton({ptt,connected,state,onDown,onUp}){
  const held=useRef(false);
  const press=e=>{e.preventDefault();if(held.current)return;held.current=true;try{e.currentTarget.setPointerCapture?.(e.pointerId)}catch{};navigator.vibrate?.(30);onDown()};
  const release=e=>{e?.preventDefault?.();if(!held.current)return;held.current=false;onUp()};
  useEffect(()=>{const off=()=>release();document.addEventListener("visibilitychange",off);return()=>document.removeEventListener("visibilitychange",off)},[]);
  const tx=state==="transmitting";
  return <button type="button" className={"n7-ptt"+(tx?" tx":ptt?" pending":"")+(connected?"":" off")}
    aria-label="Push to talk" onPointerDown={press} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={e=>e.preventDefault()}>
    {tx?"TALKING":ptt?"WAIT…":"PTT"}<small>{tx?"Let go to stop":connected?"Hold to talk":"Radio off"}</small>
  </button>;
}

export function PhoneApp(p){
  const {zones,zoneId,visibleChannels,channelId,channelName,state,connected,error,connectNote,ptt,muted,onAir,participants=[],
    scanning,scanActive,volume,lastHeard=[],incoming,call,callState,onlineUsers=[],displayName,callsign,myStatus=""}=p;
  const face=p.face||PHONE_SCREEN;
  const [screen,setScreen]=useState("home"),[notice,setNotice]=useState(""),[now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(id)},[]);
  useEffect(()=>{if(!p.flash?.text)return;setNotice(p.flash.text);const id=setTimeout(()=>setNotice(""),1600);return()=>clearTimeout(id)},[p.flash]);
  useScreenAwake(connected||state==="connecting"||state==="reconnecting");
  // An incoming call shows on the home screen, where Answer and Decline are.
  useEffect(()=>{if(incoming)setScreen("home")},[incoming?.id]);
  const zone=zones.find(z=>z.id===zoneId),chan=visibleChannels.find(c=>c.id===channelId),last=lastHeard[0];
  const tx=state==="transmitting",rx=!tx&&!!onAir?.name;
  const tone=tx?"tx":rx?"rx":incoming||call?"call":connected?"listen":state==="error"?"warn":state==="connecting"||state==="reconnecting"?"warn":"idle";
  const activity=tx?"Transmitting":rx?"Receiving · "+onAir.name
    :connected?(scanning?(scanActive?"Scan · "+scanActive:"Scanning"):"Listening · "+participants.length+" on channel")
    :state==="connecting"?"Connecting…":state==="reconnecting"?"Reconnecting…":state==="error"?(error||"Can't connect"):"Radio off · press power";
  const bars=connected?4:state==="reconnecting"||state==="connecting"?1:0;
  const go=s=>setScreen(s);
  // Next or previous channel in the zone, wrapping round (the phone looks' channel rocker).
  const step=d=>{const n=visibleChannels.length;if(!n)return;const i=visibleChannels.findIndex(c=>c.id===channelId);p.onChannel(visibleChannels[((i<0?0:i)+d+n)%n].id)};
  const list=(title,items)=><div className="n7-list"><button type="button" className="n7-back" onClick={()=>go("home")}><ChevronLeft size={20}/>{title}</button><div className="n7-items">{items}</div></div>;

  let body;
  if(screen==="zones")body=list("Zone",zones.length?zones.map(z=><button type="button" key={z.id} className={"n7-item"+(z.id===zoneId?" on":"")} onClick={()=>{p.onZone(z.id);go("home")}}>{zoneLabel(z.name)}</button>):<div className="n7-dim">No zones yet</div>);
  else if(screen==="channels")body=list(zoneLabel(zone?.name||""),visibleChannels.length?visibleChannels.map(c=><button type="button" key={c.id} className={"n7-item"+(c.id===channelId?" on":"")} onClick={()=>{p.onChannel(c.id);go("home")}}><small>{c.number}</small>{c.name}</button>):<div className="n7-dim">No channels yet</div>);
  else if(screen==="who")body=list("Who's On",participants.length?participants.map(m=>{const st=m?.attributes?.status||"",talking=onAir?.identity===m.identity;return <div className="n7-item" key={m.identity}><UserRound size={18}/><span className="n7-grow">{memberName(m)}{talking&&<small className="n7-talk">Talking</small>}</span>{st&&<em className={"status-chip "+statusClass(st)}>{st}</em>}</div>}):<div className="n7-dim">{connected?"Nobody else on this channel":"Turn the radio on to see who's on"}</div>);
  else if(screen==="recent")body=list("Recent",lastHeard.length?lastHeard.slice(0,12).map(x=><button type="button" className="n7-item" key={x.id} onClick={()=>p.onReplay(x.id)} disabled={!x.url}><span className="n7-grow">{x.name}</span><small>{hhmm(x.at)} · {secs(x.ms)}</small></button>):<div className="n7-dim">Nothing heard yet</div>);
  else if(screen==="status")body=list("My Status",STATUSES.map(s=><button type="button" key={s} className={"n7-item "+(s===myStatus?"on ":"")+statusClass(s)} onClick={()=>{p.onStatus(s===myStatus?"":s);go("home")}}>{s}</button>));
  else if(screen==="contacts")body=list("Contacts",<>
    {call&&!incoming&&<div className="n7-item n7-callrow"><span className="n7-grow"><b>{callState==="calling"?"Calling…":callState==="reconnecting"?"Reconnecting…":"Call connected"}</b><small>{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</small></span><button type="button" className="n7-pill stop" onClick={p.onEndCall}><PhoneOff size={16}/>End</button></div>}
    {onlineUsers.length?onlineUsers.map(u=><div className="n7-item" key={u.userId}><UserRound size={18}/><span className="n7-grow">{u.callsign||u.displayName}<small>{u.channelId?"On radio":"Available"}</small></span><button type="button" className="n7-pill" onClick={()=>p.onCall(u)} disabled={callState!=="idle"}><PhoneCall size={16}/>Call</button></div>):<div className="n7-dim">No other members are online right now</div>}
    {p.callError&&<div className="n7-dim err">{p.callError}</div>}
  </>);
  else if(screen==="faces")body=list("Radio",[{id:PHONE_SCREEN,label:"Phone screen",note:"Touch screen made for the phone"},...PHONE_FACES].map(f=><button type="button" key={f.id} className={"n7-item"+(f.id===face?" on":"")} onClick={()=>{p.onFace(f.id);go("home")}}><span className="n7-grow">{f.label}<small>{f.note}</small></span></button>));
  else if(screen==="more")body=list("More",<>
    {p.onFace&&<button type="button" className="n7-item" onClick={()=>go("faces")}><Radio size={18}/>Radio</button>}
    <button type="button" className="n7-item" onClick={()=>go("who")}><Users size={18}/>Who's On ({participants.length})</button>
    <button type="button" className="n7-item" onClick={()=>go("recent")}><RefreshCw size={18}/>Recent</button>
    <button type="button" className="n7-item" onClick={()=>go("status")}><UserRound size={18}/>My Status</button>
    <button type="button" className="n7-item" onClick={()=>{p.onPower();go("home")}}><Power size={18}/>{connected||state==="connecting"||state==="reconnecting"?"Radio off":"Radio on"}</button>
    <button type="button" className="n7-item" onClick={()=>go("settings")}><ListChecks size={18}/>Setup</button>
    <button type="button" className="n7-item" onClick={p.onSignOut}><LogOut size={18}/>Sign out / switch account</button>
    <div className="n7-dim">Build v{String(__APP_VERSION__)}</div>
  </>);
  else if(screen==="settings")body=<div className="n7-list"><button type="button" className="n7-back" onClick={()=>go("more")}><ChevronLeft size={20}/>Setup</button><div className="n7-setup">{p.settingsPanel}</div></div>;
  else if(face!==PHONE_SCREEN)body=<PhoneFaceBody face={face} c={{p,zone,chan,activity,tone,tx,rx,last,step,go}}/>;
  else body=<>
    <div className="n7-card n7-head"><span className="n7-name">{displayName||callsign||"Member"}</span><button type="button" className="n7-profile" onClick={()=>go("status")} aria-label="My status"><UserRound size={18} strokeWidth={2.6}/></button></div>
    <div className="n7-card n7-zonecard">
      <i className={"n7-strip "+tone}/>
      <div className="n7-icons">
        <span className="n7-bars" title={connected?"Signal":"No signal"}>{[1,2,3,4].map(n=><i key={n} className={n<=bars?"on":""}/>)}</span>
        {muted?<VolumeX size={14} strokeWidth={3}/>:<Volume2 size={14} strokeWidth={3}/>}
        <b className={scanning?"":"off"}>Z</b><b className={connected?"":"off"}>{tx?"TX":"H"}</b>
        <Users size={14} strokeWidth={3}/><b>{participants.length}</b>
      </div>
      <button type="button" className="n7-zone" onClick={()=>go("zones")}>{zoneLabel(zone?.name||"")}</button>
      <button type="button" className="n7-chan" onClick={()=>go("channels")}><ChanLine number={chan?.number} name={channelName}/></button>
      <span className={"n7-activity "+tone}>{activity}</span>
      {connectNote&&!connected&&<span className="n7-activity warn">{connectNote}</span>}
      <div className="n7-side">
        <button type="button" className={"n7-ico n7-scan"+(scanning?" on":"")} onClick={p.onScan||undefined} disabled={!p.onScan} aria-label="Scan"><svg viewBox="0 0 12 12"><rect x="1" y="2" width="10" height="3" rx="1.5"/><rect x="1" y="7" width="10" height="3" rx="1.5"/><circle cx={scanning?8.6:3.4} cy="3.5" r="2.2"/><circle cx={scanning?3.4:8.6} cy="8.5" r="2.2"/></svg></button>
        <button type="button" className="n7-ico" onClick={()=>last&&p.onReplay(last.id)} disabled={!last?.url} aria-label="Replay last"><svg viewBox="0 0 12 12"><rect x="1" y="3" width="10" height="8" rx="1.6"/><path d="M4 2.6 5.2 1h1.6L8 2.6"/><path d="M3.6 7.4a2.4 2.4 0 1 0 1-2" fill="none" strokeWidth="1.1"/><path d="M3 4.2v1.8h1.8" fill="none" strokeWidth="1.1"/></svg></button>
      </div>
    </div>
    <div className="n7-card n7-tabs">
      <button type="button" onClick={()=>go("zones")}><svg viewBox="0 0 14 11"><path d="M0 1.2Q0 0 1.2 0h3.6l1.4 1.6h6.6Q14 1.6 14 2.8v7Q14 11 12.8 11H1.2Q0 11 0 9.8Z"/></svg>Zone</button>
      <button type="button" onClick={()=>go("contacts")}><svg viewBox="0 0 16 11"><circle cx="5" cy="2.6" r="2.4"/><circle cx="11" cy="2.6" r="2.4"/><path d="M0 11V8.2Q0 5.8 2.6 5.8h4.8Q10 5.8 10 8.2V11Z"/><path d="M8.6 5.8h4.8Q16 5.8 16 8.2V11h-5.2"/></svg>Contacts</button>
      <button type="button" onClick={()=>go("more")}><svg className="dots" viewBox="0 0 14 4"><circle cx="2" cy="2" r="1.7"/><circle cx="7" cy="2" r="1.7"/><circle cx="12" cy="2" r="1.7"/></svg>More</button>
    </div>
    <div className="n7-card n7-msg">
      {incoming?<>
        <div className="n7-msg-top"><span className="n7-msg-name call">Call from {incoming.caller_display_name||incoming.caller_callsign||"Member"}</span><span className="n7-msg-text">Incoming private call</span></div>
        <div className="n7-msg-btns"><button type="button" className="go" onClick={p.onAnswer}><PhoneCall size={18}/>Answer</button><button type="button" className="stop" onClick={p.onDecline}><PhoneOff size={18}/>Decline</button></div>
      </>:call?<>
        <div className="n7-msg-top"><span className="n7-msg-name call">{callState==="calling"?"Calling…":callState==="reconnecting"?"Reconnecting…":"Call connected"}</span><span className="n7-msg-text">{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</span></div>
        <div className="n7-msg-btns"><button type="button" className="stop" onClick={p.onEndCall}><PhoneOff size={18}/>End Call</button></div>
      </>:<>
        <div className="n7-msg-top check"><i className={"n7-check"+(last?"":" off")}/><span className="n7-msg-name">{last?last.name:"No recent traffic"}</span><span className="n7-msg-text">{last?`Heard ${hhmm(last.at)} · ${secs(last.ms)}`:"Transmissions you hear show up here"}</span></div>
        <div className="n7-msg-btns">
          <button type="button" onClick={()=>last&&p.onReplay(last.id)} disabled={!last?.url}><svg viewBox="0 0 12 10"><rect x=".5" y=".5" width="11" height="7.6" rx="1.2"/><path d="M2.5 10V7.6h2.4"/><path d="M3 4.4h3.6M3 2.6h5.6" stroke="#fff" strokeWidth=".9"/><circle cx="9.4" cy="6" r="2.2" stroke="#fff" strokeWidth=".6"/></svg>Replay</button>
          <button type="button" onClick={()=>go("recent")}><svg viewBox="0 0 12 10"><path d="M.5 1.5Q.5.5 1.5.5h9q1 0 1 1v5.6q0 1-1 1H4L1.8 10V8.1H1.5q-1 0-1-1Z"/><path d="M3 2.8h6M3 4.6h6" stroke="#fff" strokeWidth=".9"/></svg>All Recent</button>
        </div>
      </>}
    </div>
    <button type="button" className="n7-card n7-loc" onClick={()=>go("status")}>
      <svg className="n7-pin" viewBox="0 0 10 14"><path d="M5 0a5 5 0 0 1 5 5c0 3.6-5 9-5 9S0 8.6 0 5a5 5 0 0 1 5-5Z"/><circle cx="5" cy="5" r="2" fill="#fff"/></svg>
      <span className="n7-loc-text"><span className={myStatus?statusClass(myStatus):""}>{myStatus?"Status: "+myStatus:"No status set"}</span><span>{callsign||"No callsign"} · {participants.length} on channel</span></span>
    </button>
  </>;

  return <div className={"n7-shell face-"+face}>
    <div className="n7-statusbar">
      <span className="n7-brand">REPEATER NATION</span>
      {tx?<em className="tx">TX</em>:rx?<em className="rx">RX</em>:null}
      <span className="n7-batt"/><span className="n7-time">{clock(now)}</span>
      <button type="button" className={"n7-power"+(connected?" on":state==="connecting"||state==="reconnecting"?" busy":"")} onClick={p.onPower} aria-label={connected?"Turn radio off":"Turn radio on"}><Power size={18}/></button>
    </div>
    {notice&&<div className="n7-flash">{notice}</div>}
    <div className="n7-screen">{body}</div>
    <div className="n7-keys">
      <PttButton ptt={ptt} connected={connected} state={state} onDown={p.onDown} onUp={p.onUp}/>
      <div className="n7-vol">
        <button type="button" onClick={p.onMute} className={muted?"on":""} aria-label={muted?"Unmute":"Mute"}>{muted?<VolumeX size={20}/>:<Volume2 size={20}/>}</button>
        <button type="button" onClick={()=>p.onVolume(-1)} aria-label="Volume down"><Minus size={20}/></button>
        <span>Vol {volume}</span>
        <button type="button" onClick={()=>p.onVolume(1)} aria-label="Volume up"><Plus size={20}/></button>
      </div>
    </div>
  </div>;
}
