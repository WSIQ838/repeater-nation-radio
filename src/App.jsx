import {useEffect,useMemo,useRef,useState} from "react";
import {Radio, Users, Phone, Settings, Mic, MicOff, Volume2, VolumeX, LogIn, Power, ChevronDown} from "lucide-react";
import {config} from "./lib/config";
import {getLoginUrl, restoreSession, clearSession} from "./lib/auth";
import {useRadio} from "./hooks/useRadio";

function Login() {
  const [checking,setChecking]=useState(true); const [message,setMessage]=useState("");
  useEffect(()=>{ let active=true; restoreSession().then(session=>{ if(active&&session) window.dispatchEvent(new CustomEvent("rn-radio-session",{detail:session})); if(active)setChecking(false); }).catch(()=>{if(active){setMessage("The radio session could not be restored.");setChecking(false);}}); return ()=>{active=false}; },[]);
  return <main className="login-shell"><div className="brand-mark"><Radio size={30}/></div><h1>Repeater Nation Radio</h1><p className="muted">Connect to the Repeater Nation network from your desktop.</p><button className="primary large" onClick={()=>window.open(getLoginUrl(),"_blank","noopener,noreferrer")} disabled={checking}><LogIn size={18}/> {checking?"Checking session…":"Sign in with Repeater Nation"}</button><p className="fine">Use your existing Repeater Nation account. This app does not create a second radio account.</p>{message&&<p className="error">{message}</p>}<div className="endpoint">Voice: {config.livekitUrl}</div></main>
}

function MemberName({participant}) {
  const info=useMemo(()=>{try{return participant?.metadata?JSON.parse(participant.metadata):{}}catch{return {}}},[participant]);
  return <div className="member"><strong>{info.callsign||info.displayName||participant?.name||participant?.identity||"Member"}</strong><span>{info.callsign&&info.displayName?info.displayName:"Connected"}</span></div>;
}

function RadioApp({session,onSignOut}) {
  const [tab,setTab]=useState("radio"),[muted,setMuted]=useState(false),[ptt,setPtt]=useState(false),[members,setMembers]=useState([]),[micReady,setMicReady]=useState(false);
  const audioRef=useRef(null);
  const {state,error,connect,startMic,setMicEnabled,disconnect,room}=useRadio();
  useEffect(()=>{if(!room)return;const sync=()=>setMembers(Array.from(room.remoteParticipants.values()));sync();const onIn=()=>sync(),onOut=()=>sync();room.on("participantConnected",onIn);room.on("participantDisconnected",onOut);return()=>{room.off("participantConnected",onIn);room.off("participantDisconnected",onOut)}},[room,state]);
  useEffect(()=>{if(!room)return;const onTrack=(track)=>{if(track.kind==="audio"&&audioRef.current){const el=track.attach();el.autoplay=true;audioRef.current.appendChild(el)}};room.on("trackSubscribed",onTrack);return()=>room.off("trackSubscribed",onTrack)},[room]);
  const connectNow=async()=>{try{await connect(session.livekitToken);await startMic();setMicReady(true);setPtt(false)}catch{}};
  const disconnectNow=async()=>{setPtt(false);setMicReady(false);await disconnect()};
  const togglePtt=async next=>{if(!micReady)return;setPtt(next);await setMicEnabled(next)};
  const logout=async()=>{await disconnectNow();clearSession();onSignOut()};
  const connected=state==="connected";
  const displayName=session.member?.displayName||session.member?.name||"Member";
  const callsign=session.member?.callsign||session.member?.callSign||"";
  const membersView=members.length?members.map(p=><MemberName key={p.identity} participant={p}/>):<div className="empty">{connected?"No other members are currently on this channel.":"Connect to see who’s on."}</div>;
  return <div className="app-shell"><header className="topbar"><div className="brand"><div className="brand-mark small"><Radio size={20}/></div><div><strong>Repeater Nation</strong><span>RADIO</span></div></div><div className="connection"><i className={connected?"online":"offline"}/>{connected?"Connected":state==="connecting"?"Connecting…":"Ready"}<ChevronDown size={14}/></div></header>
    <div className="body"><aside className="sidebar">{[["radio","Radio",Radio],["members","Who’s On",Users],["calls","Calls",Phone],["settings","Settings",Settings]].map(([id,label,Icon])=><button key={id} className={tab===id?"nav active":"nav"} onClick={()=>setTab(id)}><Icon size={19}/>{label}</button>)}</aside>
    <main className="content">{tab==="radio"&&<><section className="hero"><div><div className="eyebrow">NATION WIDE</div><h2>Repeater Nation Radio</h2><p className="muted">{displayName}{callsign?" · "+callsign:""}</p></div><button className={connected?"danger":"primary"} onClick={connected?disconnectNow:connectNow} disabled={state==="connecting"||!session.livekitToken}><Power size={17}/>{connected?"Disconnect":"Connect"}</button></section>
      <section className="radio-card"><div className="channel-head"><div><span className="label">CURRENT CHANNEL</span><h3>Nation Wide</h3></div><span className="status-pill">GMRS</span></div><div className="display"><span className="rx-dot"/><strong>{ptt?"TRANSMITTING":connected?"STANDBY":"OFFLINE"}</strong><small>{ptt?"TX ACTIVE":connected?"Ready for traffic":"Connect to monitor traffic"}</small></div>
      <div className="controls"><button className="icon-btn" onClick={()=>setMuted(!muted)}>{muted?<VolumeX/>:<Volume2/>}</button><button className={ptt?"ptt pressed":"ptt"} disabled={!connected||!micReady} onMouseDown={()=>togglePtt(true)} onMouseUp={()=>togglePtt(false)} onMouseLeave={()=>togglePtt(false)} onTouchStart={()=>togglePtt(true)} onTouchEnd={()=>togglePtt(false)}><Mic size={30}/><span>HOLD TO TALK</span></button><button className="icon-btn" onClick={()=>togglePtt(false)}>{ptt?<MicOff/>:<Mic/>}</button></div>
      <div className="device-row"><span>Microphone</span><span>Default input</span><span>Speaker</span><span>{muted?"Muted":"Audio on"}</span></div>{error&&<div className="error">{error}</div>}{!session.livekitToken&&<div className="fine">This account has not been issued a radio session token yet.</div>}</section>
      <div className="grid"><section className="panel"><div className="panel-title"><Users size={17}/> Who’s On</div>{membersView}</section><section className="panel"><div className="panel-title"><Phone size={17}/> Calls</div><div className="empty">Direct calls will appear here when call signaling is connected.</div></section></div></>}
      {tab==="members"&&<section className="panel full"><div className="panel-title"><Users/> Who’s On — Nation Wide</div>{membersView}</section>}{tab==="calls"&&<section className="panel full"><div className="panel-title"><Phone/> Calls</div><div className="empty">Direct calls will appear here when call signaling is connected.</div></section>}{tab==="settings"&&<section className="panel full"><div className="panel-title"><Settings/> Radio Settings</div><div className="setting"><span>LiveKit server</span><code>{config.livekitUrl}</code></div><div className="setting"><span>Channel</span><strong>{config.radioRoom}</strong></div><div className="setting"><span>Account</span><strong>{displayName}{callsign?" · "+callsign:""}</strong></div><button className="danger" onClick={logout}>Sign out</button></section>}</main></div><div ref={audioRef} style={{display:"none"}}/></div>;
}

export default function App(){const [session,setSession]=useState(null);useEffect(()=>{const handler=e=>setSession(e.detail);window.addEventListener("rn-radio-session",handler);restoreSession().then(s=>{if(s)setSession(s)}).catch(()=>{});return()=>window.removeEventListener("rn-radio-session",handler)},[]);return session?<RadioApp session={session} onSignOut={()=>setSession(null)}/>:<Login/>}