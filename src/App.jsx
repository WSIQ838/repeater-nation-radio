import {useState} from "react";
import {Radio, Users, Phone, Settings, Mic, MicOff, Volume2, VolumeX, LogIn, Power, ChevronDown} from "lucide-react";

const APP_URL=import.meta.env.VITE_REPEATER_NATION_APP_URL||"https://repeaternation.com";
const LIVEKIT_URL=import.meta.env.VITE_LIVEKIT_URL||"wss://voice.repeaternation.com";

function Login({onLogin}) {
  return <main className="login-shell">
    <div className="brand-mark"><Radio size={30}/></div>
    <h1>Repeater Nation Radio</h1>
    <p className="muted">Connect to the Repeater Nation network from your desktop.</p>
    <button className="primary large" onClick={()=>{window.open(APP_URL,"_blank");onLogin();}}>
      <LogIn size={18}/> Sign in with Repeater Nation
    </button>
    <p className="fine">Your existing Repeater Nation account is used. This app does not create a second radio account.</p>
    <div className="endpoint">Voice: {LIVEKIT_URL}</div>
  </main>
}

function RadioApp() {
  const [connected,setConnected]=useState(false),[muted,setMuted]=useState(false),[ptt,setPtt]=useState(false),[tab,setTab]=useState("radio");
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark small"><Radio size={20}/></div><div><strong>Repeater Nation</strong><span>RADIO</span></div></div>
      <div className="connection"><i className={connected?"online":"offline"}/>{connected?"Connected":"Ready"}<ChevronDown size={14}/></div>
    </header>
    <div className="body">
      <aside className="sidebar">
        {[["radio","Radio",Radio],["members","Who's On",Users],["calls","Calls",Phone],["settings","Settings",Settings]].map(([id,label,Icon])=><button key={id} className={tab===id?"nav active":"nav"} onClick={()=>setTab(id)}><Icon size={19}/>{label}</button>)}
      </aside>
      <main className="content">
        {tab==="radio"&&<><section className="hero">
          <div><div className="eyebrow">NATION WIDE</div><h2>Repeater Nation Radio</h2><p className="muted">Your radio, wherever you are.</p></div>
          <button className={connected?"danger":"primary"} onClick={()=>setConnected(!connected)}><Power size={17}/>{connected?"Disconnect":"Connect"}</button>
        </section>
        <section className="radio-card">
          <div className="channel-head"><div><span className="label">CURRENT CHANNEL</span><h3>Nation Wide</h3></div><span className="status-pill">GMRS</span></div>
          <div className="display"><span className="rx-dot"/><strong>{ptt?"TRANSMITTING":"STANDBY"}</strong><small>{ptt?"TX ACTIVE":"Ready for traffic"}</small></div>
          <div className="controls">
            <button className="icon-btn" onClick={()=>setMuted(!muted)}>{muted?<VolumeX/>:<Volume2/>}</button>
            <button className={ptt?"ptt pressed":"ptt"} onMouseDown={()=>setPtt(true)} onMouseUp={()=>setPtt(false)} onMouseLeave={()=>setPtt(false)}><Mic size={30}/><span>HOLD TO TALK</span></button>
            <button className="icon-btn" onClick={()=>setMuted(!muted)}>{muted?<MicOff/>:<Mic/>}</button>
          </div>
          <div className="device-row"><span>Microphone</span><span>Default input</span><span>Speaker</span><span>Default output</span></div>
        </section>
        <div className="grid">
          <section className="panel"><div className="panel-title"><Users size={17}/> Who's On</div><div className="empty">No members are currently showing on this channel.</div></section>
          <section className="panel"><div className="panel-title"><Phone size={17}/> Calls</div><div className="empty">Incoming and direct calls will appear here.</div></section>
        </div></>}
        {tab==="members"&&<section className="panel full"><div className="panel-title"><Users/> Who's On — Nation Wide</div><div className="empty">Presence will be loaded from your Repeater Nation account.</div></section>}
        {tab==="calls"&&<section className="panel full"><div className="panel-title"><Phone/> Calls</div><div className="empty">No active calls.</div></section>}
        {tab==="settings"&&<section className="panel full"><div className="panel-title"><Settings/> Radio Settings</div><div className="setting"><span>LiveKit server</span><code>{LIVEKIT_URL}</code></div><div className="setting"><span>Account</span><strong>Repeater Nation</strong></div></section>}
      </main>
    </div>
  </div>
}

export default function App(){const [loggedIn,setLoggedIn]=useState(false);return loggedIn?<RadioApp/>:<Login onLogin={()=>setLoggedIn(true)}/>}