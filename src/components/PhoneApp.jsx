import {useEffect,useMemo,useRef,useState} from "react";
import {Radio,Users,Phone,Settings,Power,ChevronLeft,ChevronRight,Volume2,VolumeX,Minus,Plus,PhoneCall,PhoneOff,RefreshCw,ScanLine} from "lucide-react";
import {zoneLabel,chanLabel} from "../lib/labels";
import {statusClass} from "../lib/status";

// The Android and iPhone app (and a phone-sized browser) gets a simple phone screen instead
// of the radio faces: zone and channel, one big PTT button, who's on, calls and settings.
// __MOBILE__ is set when Tauri builds for Android or iOS.
export const IS_PHONE=(typeof __MOBILE__!=="undefined"&&__MOBILE__)||(typeof navigator!=="undefined"&&/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||""));

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
  return <button type="button" className={"phone-ptt"+(tx?" tx":ptt?" pending":"")+(connected?"":" off")}
    aria-label="Push to talk" onPointerDown={press} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={e=>e.preventDefault()}>
    <span>{tx?"TALKING":ptt?"WAIT…":"PUSH TO TALK"}</span>
  </button>;
}

export function PhoneApp(p){
  const [tab,setTab]=useState("radio"),[notice,setNotice]=useState("");
  useEffect(()=>{if(!p.flash?.text)return;setNotice(p.flash.text);const id=setTimeout(()=>setNotice(""),1600);return()=>clearTimeout(id)},[p.flash]);
  useScreenAwake(p.connected||p.state==="connecting"||p.state==="reconnecting");
  // An incoming call opens the Calls tab.
  useEffect(()=>{if(p.incoming)setTab("calls")},[p.incoming?.id]);
  const zone=p.zones.find(z=>z.id===p.zoneId);
  const others=useMemo(()=>p.participants||[],[p.participants]);
  const line=p.state==="transmitting"?"Transmitting":p.onAir?.name?"Receiving · "+p.onAir.name
    :p.connected?(p.scanning?(p.scanActive?"Scan · "+p.scanActive:"Scanning"):"Listening")
    :p.state==="connecting"?"Connecting…":p.state==="reconnecting"?"Reconnecting…":p.state==="error"?(p.error||"Can't connect"):"Radio off";
  const lineClass=p.state==="transmitting"?"tx":p.onAir?.name?"rx":p.connected?"on":p.state==="error"?"err":"";
  const step=(list,cur,dir)=>{if(!list.length)return null;const at=list.findIndex(x=>x.id===cur);return list[((at<0?0:at)+dir+list.length)%list.length]};

  return <div className="phone-shell">
    <header className="phone-top">
      <div className="brand"><div className="brand-mark small"><Radio size={18}/></div><div><strong>Repeater Nation</strong><span>RADIO</span></div></div>
      <button type="button" className={"phone-power"+(p.connected?" on":p.state==="connecting"||p.state==="reconnecting"?" busy":"")} onClick={p.onPower} aria-label={p.connected?"Turn radio off":"Turn radio on"}><Power size={22}/></button>
    </header>
    {notice&&<div className="phone-flash">{notice}</div>}
    <main className="phone-main">
      {tab==="radio"&&<>
        <section className="phone-card phone-tuner">
          <div className="phone-row">
            <button type="button" className="phone-step" aria-label="Previous zone" onClick={()=>{const z=step(p.zones,p.zoneId,-1);if(z)p.onZone(z.id)}}><ChevronLeft/></button>
            <select aria-label="Zone" value={p.zoneId} onChange={e=>p.onZone(e.target.value)} disabled={!p.zones.length}>{p.zones.map(z=><option key={z.id} value={z.id}>{zoneLabel(z.name)}</option>)}</select>
            <button type="button" className="phone-step" aria-label="Next zone" onClick={()=>{const z=step(p.zones,p.zoneId,1);if(z)p.onZone(z.id)}}><ChevronRight/></button>
          </div>
          <div className="phone-row big">
            <button type="button" className="phone-step" aria-label="Previous channel" onClick={()=>{const c=step(p.visibleChannels,p.channelId,-1);if(c)p.onChannel(c.id)}}><ChevronLeft/></button>
            <select aria-label="Channel" value={p.channelId} onChange={e=>p.onChannel(e.target.value)} disabled={!p.visibleChannels.length}>
              {!p.visibleChannels.length&&<option value={p.channelId}>{p.channelName||"Loading channels…"}</option>}
              {p.visibleChannels.map(c=><option key={c.id} value={c.id}>{chanLabel(c.number,c.name)}</option>)}
            </select>
            <button type="button" className="phone-step" aria-label="Next channel" onClick={()=>{const c=step(p.visibleChannels,p.channelId,1);if(c)p.onChannel(c.id)}}><ChevronRight/></button>
          </div>
          <div className={"phone-line "+lineClass}>{line}</div>
          {p.connectNote&&!p.connected&&<div className="phone-note">{p.connectNote}</div>}
          <div className="phone-meta"><span>{zoneLabel(zone?.name||"")}</span><span>{p.connected?(others.length+" on channel"):"Off the air"}</span></div>
        </section>
        <PttButton ptt={p.ptt} connected={p.connected} state={p.state} onDown={p.onDown} onUp={p.onUp}/>
        <section className="phone-controls">
          <button type="button" onClick={p.onMute} className={p.muted?"on":""} aria-label={p.muted?"Unmute":"Mute"}>{p.muted?<VolumeX size={20}/>:<Volume2 size={20}/>}<small>{p.muted?"Muted":"Sound"}</small></button>
          <button type="button" onClick={()=>p.onVolume(-1)} aria-label="Volume down"><Minus size={20}/><small>Vol</small></button>
          <div className="phone-vol"><strong>{p.volume}</strong><small>Volume</small></div>
          <button type="button" onClick={()=>p.onVolume(1)} aria-label="Volume up"><Plus size={20}/><small>Vol</small></button>
          <button type="button" onClick={p.onScan||undefined} disabled={!p.onScan} className={p.scanning?"on":""} aria-label="Scan"><ScanLine size={20}/><small>Scan</small></button>
        </section>
        <section className="phone-card">
          <div className="phone-title"><RefreshCw size={16}/> Last heard</div>
          {p.lastHeard.length?p.lastHeard.slice(0,8).map(x=><div className="phone-item" key={x.id}><div><strong>{x.name}</strong><span>{new Date(x.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} · {Math.max(1,Math.round(x.ms/1000))} s</span></div><button type="button" onClick={()=>p.onReplay(x.id)} disabled={!x.url}>Replay</button></div>)
            :<div className="phone-empty">Transmissions you hear show up here.</div>}
        </section>
      </>}
      {tab==="members"&&<>
        <section className="phone-card">
          <div className="phone-title"><Users size={16}/> Who's on {p.channelName}</div>
          {others.length?others.map(m=>{const st=m?.attributes?.status||"";const talking=p.onAir?.identity===m.identity;return <div className="phone-item" key={m.identity}><div><strong>{memberName(m)}</strong><span className={talking?"talking":""}>{talking?"Transmitting":memberInfo(m).displayName||"Connected"}</span></div>{st&&<em className={"status-chip "+statusClass(st)}>{st}</em>}</div>})
            :<div className="phone-empty">{p.connected?"Nobody else is on this channel right now.":"Turn the radio on to see who's on."}</div>}
        </section>
        <section className="phone-card"><div className="phone-title">My status</div>{p.statusPanel}</section>
      </>}
      {tab==="calls"&&<section className="phone-card">
        <div className="phone-title"><Phone size={16}/> Calls</div>
        {p.incoming&&<div className="phone-call"><strong>Incoming call</strong><span>{p.incoming.caller_display_name||p.incoming.caller_callsign||"Member"}</span><div><button className="primary" onClick={p.onAnswer}><PhoneCall size={16}/> Answer</button><button className="danger" onClick={p.onDecline}><PhoneOff size={16}/> Decline</button></div></div>}
        {p.call&&!p.incoming&&<div className="phone-call"><strong>{p.callState==="calling"?"Calling…":p.callState==="reconnecting"?"Call reconnecting…":"Call connected"}</strong><span>{p.call.recipient_display_name||p.call.recipient_callsign||p.call.caller_display_name||"Member"}</span><div><button className="danger" onClick={p.onEndCall}><PhoneOff size={16}/> End call</button></div></div>}
        {p.onlineUsers.length?p.onlineUsers.map(u=><div className="phone-item" key={u.userId}><div><strong>{u.callsign||u.displayName}</strong><span>{u.channelId?"On radio":"Available"}</span></div><button type="button" className="primary" onClick={()=>p.onCall(u)} disabled={p.callState!=="idle"}><PhoneCall size={15}/> Call</button></div>)
          :<div className="phone-empty">No other members are online right now.</div>}
        {p.callError&&<div className="error">{p.callError}</div>}
      </section>}
      {tab==="settings"&&<section className="phone-card phone-settings">
        <div className="phone-title"><Settings size={16}/> Settings</div>
        <div className="phone-account"><strong>{p.displayName}</strong><span>{p.callsign||""}</span></div>
        {p.settingsPanel}
        <div className="phone-version">Build v{String(__APP_VERSION__)}</div>
        <button type="button" className="danger" onClick={p.onSignOut}><RefreshCw size={16}/> Sign out / switch account</button>
      </section>}
    </main>
    <nav className="phone-tabs">{[["radio","Radio",Radio],["members","Who's On",Users],["calls","Calls",Phone],["settings","Settings",Settings]].map(([id,label,Icon])=>
      <button type="button" key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={21}/><span>{label}</span>{id==="calls"&&p.incoming&&<i className="phone-dot"/>}</button>)}</nav>
  </div>;
}
