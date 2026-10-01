import {useEffect,useMemo,useState} from "react";
import {Radio,Users,Phone,Settings,Mic,MicOff,Volume2,VolumeX,LogIn,Power,ChevronDown,PhoneCall,PhoneOff,RefreshCw} from "lucide-react";
import {config} from "./lib/config";
import {loginWithPassword,clearSession,listRadioChannels} from "./lib/auth";
import {openUrl} from "@tauri-apps/plugin-opener";
import {useRadio} from "./hooks/useRadio";
import {useDirectCalls} from "./hooks/useDirectCalls";

function Login(){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const submit=async e=>{
    e?.preventDefault();
    if(busy)return;
    setError("");setBusy(true);
    try{
      const session=await loginWithPassword(email,password);
      window.dispatchEvent(new CustomEvent("rn-radio-session",{detail:session}));
    }catch(err){
      const message=err?.response?.data?.message||err?.response?.data?.error||err?.message||"Unable to sign in. Check your email and password.";
      setError(String(message));
    }finally{setBusy(false)}
  };

  return <main className="login-shell">
    <div className="brand-mark"><Radio size={30}/></div>
    <h1>Repeater Nation Radio</h1>
    <p className="muted">Sign in with your existing Repeater Nation account.</p>
    <form onSubmit={submit} className="login-form">
      <label>Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" disabled={busy}/></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" disabled={busy}/></label>
      {error&&<div className="error">{error}</div>}
      <button className="primary large" type="submit" disabled={busy||!email.trim()||!password}>
        <LogIn size={18}/>{busy?" Signing in…":" Sign in"}
      </button>
    </form>
    <p className="fine">Use the same Repeater Nation account you use on the website. The desktop app will not silently reuse an old session at startup, so you always have a visible sign-in screen.</p>
  </main>
}

function UpdateStatus(){
  const [status,setStatus]=useState("checking");
  const [release,setRelease]=useState(null);
  const check=async()=>{
    setStatus("checking");
    try{
      const r=await fetch("https://api.github.com/repos/jamessterlinglive/repeater-nation-radio/releases/latest",{headers:{Accept:"application/vnd.github+json"}});
      if(!r.ok)throw new Error("Update service returned "+r.status);
      const data=await r.json();
      const latest=String(data.tag_name||"").replace(/^radio-v/i,"").replace(/^v/i,"");
      const current=String(import.meta.env.VITE_APP_VERSION||"0.1.2");
      const n=s=>s.split(".").map(x=>parseInt(x,10)||0);
      const a=n(current),b=n(latest); const newer=b[0]>a[0]||(b[0]===a[0]&&(b[1]>a[1]||(b[1]===a[1]&&b[2]>a[2])));
      if(newer){setRelease({...data,version:latest});setStatus("available")}else setStatus("current");
    }catch(e){console.error("[update]",e);setStatus("error")}
  };
  useEffect(()=>{check()},[]);
  if(status==="checking")return <div className="update-row"><span>Updates</span><strong>Checking…</strong></div>;
  if(status==="available")return <div className="update-row"><span>Update available · v{release.version}</span><button className="primary" onClick={()=>{const asset=(release.assets||[]).find(a=>/\\.exe$/i.test(a.name));openUrl(asset?.browser_download_url||release.html_url)}}>Install update</button></div>;
  if(status==="error")return <div className="update-row"><span>Update check failed</span><button onClick={check}>Check again</button></div>;
  return <div className="update-row"><span>Updates</span><strong>You're up to date</strong><button onClick={check}>Check now</button></div>;
}

function MemberName({participant}){
  const info=useMemo(()=>{try{return participant?.metadata?JSON.parse(participant.metadata):{}}catch{return {}}},[participant]);
  return <div className="member"><strong>{info.callsign||info.displayName||participant?.name||participant?.identity||"Member"}</strong><span>{info.callsign&&info.displayName?info.displayName:"Connected"}</span></div>
}

function RadioApp({session,onSignOut}){
  const [tab,setTab]=useState("radio"),[ptt,setPtt]=useState(false),[channels,setChannels]=useState([]),[channelId,setChannelId]=useState(config.defaultChannelId),[channelName,setChannelName]=useState(config.defaultChannelName),[micDeviceId,setMicDeviceId]=useState("");
  const {state,error,session:radioSession,participants,muted,setMuted,devices,refreshDevices,connect,requestPTT,releasePTT,disconnect}=useRadio(channelId);
  const {onlineUsers,incoming,call,callState,error:callError,startCall,accept,decline,endCall}=useDirectCalls(session.member?.id);

  useEffect(()=>{
    let active=true;
    listRadioChannels().then(list=>{
      if(!active)return;
      setChannels(list);
      const current=list.find(x=>x.id===channelId)||list.find(x=>x.id===config.defaultChannelId)||list[0];
      if(current){setChannelId(current.id);setChannelName(current.name)}
    }).catch(err=>console.error("[radio] channel load failed",err));
    return()=>{active=false};
  },[]);

  useEffect(()=>{const current=channels.find(x=>x.id===channelId);if(current)setChannelName(current.name)},[channels,channelId]);

  const connected=state==="listening"||state==="transmitting";
  const chooseChannel=async e=>{
    const next=e.target.value;if(next===channelId)return;
    setPtt(false);await disconnect();
    const c=channels.find(x=>x.id===next);setChannelId(next);setChannelName(c?.name||"Radio");
  };
  const down=async()=>{if(!connected||ptt)return;setPtt(true);try{await requestPTT(micDeviceId)}catch{setPtt(false)}};
  const up=async()=>{if(!ptt)return;setPtt(false);await releasePTT()};

  useEffect(()=>{
    const keyDown=e=>{if((e.code==="Space"||e.code==="Numpad0")&&connected&&!e.repeat){e.preventDefault();down()}};
    const keyUp=e=>{if(e.code==="Space"||e.code==="Numpad0"){e.preventDefault();up()}};
    window.addEventListener("keydown",keyDown);window.addEventListener("keyup",keyUp);
    return()=>{window.removeEventListener("keydown",keyDown);window.removeEventListener("keyup",keyUp)}
  },[connected,ptt,micDeviceId]);

  const logout=async()=>{await disconnect();await endCall();await clearSession();onSignOut()};
  const displayName=radioSession?.displayName||session.member?.full_name||session.member?.email||"Member";
  const callsign=radioSession?.callsign||session.member?.callsign||"";

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark small"><Radio size={20}/></div><div><strong>Repeater Nation</strong><span>RADIO</span></div></div>
      <div className="connection"><i className={connected?"online":"offline"}/>{connected?"Connected":state==="connecting"?"Connecting…":"Ready"}<ChevronDown size={14}/></div>
    </header>
    <div className="body">
      <aside className="sidebar">{[["radio","Radio",Radio],["members","Who’s On",Users],["calls","Calls",Phone],["settings","Settings",Settings]].map(([id,label,Icon])=><button key={id} className={tab===id?"nav active":"nav"} onClick={()=>setTab(id)}><Icon size={19}/>{label}</button>)}</aside>
      <main className="content">
        {tab==="radio"&&<>
          <section className="hero"><div><div className="eyebrow">{channelName.toUpperCase()}</div><h2>Repeater Nation Radio</h2><p className="muted">{displayName}{callsign?" · "+callsign:""}</p></div><button className={connected?"danger":"primary"} onClick={connected?disconnect:connect} disabled={state==="connecting"}><Power size={17}/>{connected?"Disconnect":"Connect"}</button></section>
          <section className="radio-card">
            <div className="channel-head"><div><span className="label">CURRENT CHANNEL</span><select value={channelId} onChange={chooseChannel}>{channels.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></div><span className="status-pill">RADIO</span></div>
            <div className="display"><span className="rx-dot"/><strong>{ptt?"TRANSMITTING":connected?"STANDBY":"OFFLINE"}</strong><small>{ptt?"TX ACTIVE":connected?"Ready for traffic":"Connect to monitor traffic"}</small></div>
            <div className="controls"><button className="icon-btn" onClick={()=>setMuted(!muted)}>{muted?<VolumeX/>:<Volume2/>}</button><button className={ptt?"ptt pressed":"ptt"} disabled={!connected} onMouseDown={down} onMouseUp={up} onMouseLeave={up} onTouchStart={down} onTouchEnd={up}><Mic size={30}/><span>HOLD TO TALK</span></button><button className="icon-btn" onClick={up}>{ptt?<MicOff/>:<Mic/>}</button></div>
            <div className="device-row"><span>Microphone</span><select value={micDeviceId} onFocus={refreshDevices} onChange={e=>setMicDeviceId(e.target.value)}><option value="">System default</option>{devices.filter(d=>d.kind==="audioinput").map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||"Microphone"}</option>)}</select><span>Speaker</span><span>{muted?"Muted":"Audio on"}</span><small>Space / Numpad 0 = PTT</small></div>
            {error&&<div className="error">{error}</div>}
          </section>
          <div className="grid"><section className="panel"><div className="panel-title"><Users size={17}/> Who’s On</div>{participants.length?participants.map(p=><MemberName key={p.identity} participant={p}/>):<div className="empty">{connected?"No other members are currently on this channel.":"Connect to see who’s on."}</div>}</section><section className="panel"><div className="panel-title"><Phone size={17}/> Calls</div>{incoming?<div className="call-card"><strong>Incoming call</strong><span>{incoming.caller_display_name||incoming.caller_callsign||"Member"}</span><div><button className="primary" onClick={accept}><PhoneCall size={16}/> Answer</button><button className="danger" onClick={decline}><PhoneOff size={16}/> Decline</button></div></div>:call?<div className="call-card"><strong>{callState==="calling"?"Calling…":"Call connected"}</strong><span>{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</span><button className="danger" onClick={endCall}><PhoneOff size={16}/> End call</button></div>:<div className="empty">Open Calls to see available members.</div>}</section></div>
        </>}
        {tab==="members"&&<section className="panel full"><div className="panel-title"><Users/> Who’s On — {channelName}</div>{participants.length?participants.map(p=><MemberName key={p.identity} participant={p}/>):<div className="empty">{connected?"No other members are currently on this channel.":"Connect to see who’s on."}</div>}</section>}
        {tab==="calls"&&<section className="panel full"><div className="panel-title"><Phone/> Calls</div>{incoming&&<div className="call-card"><strong>Incoming call</strong><span>{incoming.caller_display_name||incoming.caller_callsign||"Member"}</span><div><button className="primary" onClick={accept}><PhoneCall size={16}/> Answer</button><button className="danger" onClick={decline}><PhoneOff size={16}/> Decline</button></div></div>}{call&&!incoming&&<div className="call-card"><strong>{callState==="calling"?"Calling…":"Call connected"}</strong><span>{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</span><button className="danger" onClick={endCall}><PhoneOff size={16}/> End call</button></div>}<div className="panel-title"><Users size={17}/> Available Members</div>{onlineUsers.length?onlineUsers.map(u=><div className="member" key={u.userId}><div><strong>{u.callsign||u.displayName}</strong><span>{u.channelId?"On radio":"Available"}</span></div><button className="primary" onClick={()=>startCall(u)} disabled={callState!=="idle"}><PhoneCall size={15}/> Call</button></div>):<div className="empty">No other radio members are currently online.</div>}{callError&&<div className="error">{callError}</div>}</section>}
        {tab==="settings"&&<section className="panel full"><div className="panel-title"><Settings/> Radio Settings</div><div className="setting"><span>LiveKit server</span><code>{radioSession?.liveKitUrl||config.livekitUrl}</code></div><div className="setting"><span>Channel</span><strong>{channelName}</strong></div><div className="setting"><span>Account</span><strong>{displayName}{callsign?" · "+callsign:""}</strong></div><div className="setting"><span>PTT</span><strong>Hold Space or Numpad 0</strong></div><UpdateStatus/><button className="danger" onClick={logout}><RefreshCw size={16}/> Sign out / switch account</button></section>}
      </main>
    </div>
  </div>
}

export default function App(){
  const [session,setSession]=useState(null);
  useEffect(()=>{
    const handler=e=>setSession(e.detail);
    window.addEventListener("rn-radio-session",handler);
    return()=>window.removeEventListener("rn-radio-session",handler);
  },[]);
  return session?<RadioApp session={session} onSignOut={()=>setSession(null)}/>:<Login/>;
}