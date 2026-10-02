import {useEffect,useMemo,useRef,useState} from "react";
import {Radio,Users,Phone,Settings,LogIn,Power,ChevronDown,PhoneCall,PhoneOff,RefreshCw} from "lucide-react";
import {config} from "./lib/config";
import {loginWithPassword,loginWithGoogle,restoreSessionFromOAuth,reportAuthStatus,clearSession,listRadioChannels} from "./lib/auth";
import {openUrl} from "@tauri-apps/plugin-opener";
import {fetch as tauriFetch} from "@tauri-apps/plugin-http";
import {getCurrent,onOpenUrl} from "@tauri-apps/plugin-deep-link";
import {useRadio} from "./hooks/useRadio";
import {useDirectCalls} from "./hooks/useDirectCalls";
import {prewarmRadio} from "./lib/livekit";
import {HAND_MIC,listenHardware,loadBinding,pttCapabilities,saveBinding,setHardwareBinding,setLearning} from "./lib/ptt";
import {ControlHead,PalmMic} from "./components/ControlHead";
import "./apx.css";

const AUTO_CONNECT_SETTLE_MS=350;

function Login(){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [googleBusy,setGoogleBusy]=useState(false);
  const [authStatus,setAuthStatus]=useState(null);
  useEffect(()=>{
    const onStatus=e=>{setAuthStatus(e.detail);if(e.detail?.error)setGoogleBusy(false)};
    window.addEventListener("rn-auth-status",onStatus);
    return()=>window.removeEventListener("rn-auth-status",onStatus);
  },[]);

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

  const googleLogin=async()=>{
    if(googleBusy||busy)return;
    setError("");setGoogleBusy(true);
    try{
      await loginWithGoogle();
      // The OAuth result returns through the repeaternation:// deep link.
      // The app-level deep-link listener below completes the sign-in.
    }catch(err){
      const message=err?.response?.data?.message||err?.response?.data?.error||err?.message||"Unable to start Google sign-in.";
      setError(String(message));
      setGoogleBusy(false);
    }
  };

  return <main className="login-shell">
    <div className="brand-mark"><Radio size={30}/></div>
    <h1>Repeater Nation Radio</h1>
    <p className="muted">Sign in with your existing Repeater Nation account.</p>
    <button type="button" className="google-login" onClick={googleLogin} disabled={busy||googleBusy}><span className="google-g">G</span>{googleBusy?"Signing in with Google…":"Continue with Google"}</button>
    {authStatus&&<div className={authStatus.error?"error":"auth-status"}>{authStatus.message}</div>}
    <div className="login-divider"><span>or</span></div>
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
      const r=await tauriFetch("https://api.github.com/repos/WSIQ838/repeater-nation-radio/releases?per_page=20",{
        headers:{Accept:"application/vnd.github+json"}
      });
      if(!r.ok)throw new Error("Update service returned "+r.status);
      const releases=await r.json();
      const candidates=(Array.isArray(releases)?releases:[])
        .filter(x=>!x.draft&&/^radio-v\d+\.\d+\.\d+$/i.test(String(x.tag_name||"")))
        .sort((a,b)=>{
          const parse=s=>String(s||"").replace(/^radio-v/i,"").split(".").map(x=>parseInt(x,10)||0);
          const av=parse(a.tag_name),bv=parse(b.tag_name);
          return bv[0]-av[0]||bv[1]-av[1]||bv[2]-av[2];
        });
      const data=candidates[0];
      if(!data){
        setStatus("current");
        setRelease(null);
        return;
      }
      const latest=String(data.tag_name).replace(/^radio-v/i,"");
      const current=String(__APP_VERSION__);
      const n=s=>s.split(".").map(x=>parseInt(x,10)||0);
      const a=n(current),b=n(latest);
      const newer=b[0]>a[0]||(b[0]===a[0]&&(b[1]>a[1]||(b[1]===a[1]&&b[2]>a[2])));
      if(newer){setRelease({...data,version:latest});setStatus("available")}
      else{setRelease(null);setStatus("current")}
    }catch(e){
      console.error("[update]",e);
      setStatus("error");
    }
  };

  useEffect(()=>{check()},[]);
  const icon=<RefreshCw size={18}/>;
  if(status==="checking")return <div className="update-widget"><div className="channel-head"><div className="update-title">{icon}<div><span className="label">RADIO UPDATE</span><h3>Checking for updates…</h3></div></div><span className="status-pill">CHECKING</span></div><div className="update-display"><div><strong>Repeater Nation Radio</strong><small>Checking the latest published release</small></div></div></div>;
  if(status==="available")return <div className="update-widget"><div className="channel-head"><div className="update-title">{icon}<div><span className="label">RADIO UPDATE</span><h3>Update available</h3></div></div><span className="status-pill">READY</span></div><div className="update-display"><div><strong>Version {release.version}</strong><small>A newer Repeater Nation Radio release is ready.</small></div><span className="rx-dot"/></div><div className="update-actions"><button className="primary" onClick={()=>{const asset=/Windows/i.test(navigator.userAgent)?(release.assets||[]).find(a=>/\.exe$/i.test(a.name)):null;openUrl(asset?.browser_download_url||release.html_url)}}>Install update</button></div></div>;
  if(status==="error")return <div className="update-widget"><div className="channel-head"><div className="update-title">{icon}<div><span className="label">RADIO UPDATE</span><h3>Update check failed</h3></div></div><span className="status-pill">OFFLINE</span></div><div className="update-display"><div><strong>Could not check GitHub</strong><small>Try again when an internet connection is available.</small></div></div><div className="update-actions"><button onClick={check}>Check again</button></div></div>;
  return <div className="update-widget"><div className="channel-head"><div className="update-title">{icon}<div><span className="label">RADIO UPDATE</span><h3>Repeater Nation Radio</h3></div></div><span className="status-pill">CURRENT</span></div><div className="update-display"><div><strong>You're up to date</strong><small>You're running the latest published version.</small></div><span className="rx-dot"/></div><div className="update-actions"><button onClick={check}>Check now</button></div></div>;
}

function MemberName({participant}){
  const info=useMemo(()=>{try{return participant?.metadata?JSON.parse(participant.metadata):{}}catch{return {}}},[participant]);
  return <div className="member"><strong>{info.callsign||info.displayName||participant?.name||participant?.identity||"Member"}</strong><span>{info.callsign&&info.displayName?info.displayName:"Connected"}</span></div>
}

const readPref=key=>{try{return localStorage.getItem(key)}catch{return null}};
const writePref=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
const keyLabel=e=>e.code==="Space"?"Space":e.key&&e.key.length===1?e.key.toUpperCase():e.code.replace(/^Key|^Digit/,"");

function PttLearn({binding,learning,onLearn,onCancel,onClear}){
  if(learning)return <div className="ptt-learn learning"><span>Press your PTT button… (Esc cancels)</span><button onClick={onCancel}>Cancel</button></div>;
  return <div className="ptt-learn"><span>{binding?"PTT button: "+binding.label:"No PTT button set"}</span><button onClick={onLearn}>{binding?"Change":"Learn PTT button"}</button>{binding&&<button onClick={onClear} aria-label="Clear PTT button">Clear</button>}</div>;
}

function RadioApp({session,onSignOut}){
  const [tab,setTab]=useState("radio"),[ptt,setPtt]=useState(false),[channels,setChannels]=useState([]),[zoneId,setZoneId]=useState(""),[channelId,setChannelId]=useState(config.defaultChannelId),[channelName,setChannelName]=useState(config.defaultChannelName),[micDeviceId,setMicDeviceId]=useState(()=>readPref("rn-mic")||""),[speakerId,setSpeakerId]=useState(()=>readPref("rn-speaker")||"");
  const zones=useMemo(()=>Array.from(new Map(channels.filter(c=>c.zoneId).map(c=>[c.zoneId,{id:c.zoneId,name:c.zoneName||"Radio"}])).values()),[channels]);
  const visibleChannels=useMemo(()=>zoneId?channels.filter(c=>c.zoneId===zoneId):channels,[channels,zoneId]);
  const {state,error,session:radioSession,participants,muted,setMuted,devices,refreshDevices,connect,requestPTT,releasePTT,disconnect}=useRadio(channelId, channels.find(x=>x.id===channelId), speakerId);
  const {onlineUsers,incoming,call,callState,error:callError,startCall,accept,decline,endCall}=useDirectCalls(session.member?.id, speakerId);

  useEffect(()=>{prewarmRadio()},[]);
  useEffect(()=>{
    let active=true;
    listRadioChannels().then(list=>{
      if(!active)return;
      setChannels(list);
      const current=list.find(x=>x.id===channelId)||list.find(x=>x.id===config.defaultChannelId)||list[0];
      if(current){setChannelId(current.id);setChannelName(current.name);setZoneId(current.zoneId||"")}
    }).catch(err=>console.error("[radio] channel load failed",err));
    return()=>{active=false};
  },[]);

  useEffect(()=>{const current=channels.find(x=>x.id===channelId);if(current)setChannelName(current.name)},[channels,channelId]);

  const connected=state==="listening"||state==="transmitting";
  const currentChannel=channels.find(x=>x.id===channelId);
  const selectZone=async next=>{
    if(next===zoneId)return;
    // "All Zones" only widens the channel list; keep the current channel.
    if(!next){setZoneId("");return}
    setPttState(false);await disconnect();
    const first=channels.find(c=>c.zoneId===next);
    setZoneId(next);setChannelId(first?.id||"");setChannelName(first?.name||"Radio");setTuneSeq(n=>n+1);
  };
  const selectChannel=async next=>{
    if(next===channelId)return;
    setPttState(false);await disconnect();
    const c=channels.find(x=>x.id===next);setChannelId(next);setChannelName(c?.name||"Radio");
    if(c?.zoneId)setZoneId(c.zoneId);
    setTuneSeq(n=>n+1);
  };
  // Picking a zone or channel tunes the radio there: after a short settle (so spinning
  // a knob does not join every channel it passes) connect to the new channel.
  const [tuneSeq,setTuneSeq]=useState(0),connectRef=useRef(connect);
  connectRef.current=connect;
  useEffect(()=>{
    if(!tuneSeq||!channelId)return;
    const id=setTimeout(()=>connectRef.current().catch(()=>{}),AUTO_CONNECT_SETTLE_MS);
    return()=>clearTimeout(id);
  },[tuneSeq]);
  const chooseZone=e=>selectZone(e.target.value);
  const chooseChannel=e=>selectChannel(e.target.value);
  // PTT can be keyed from the palm mic, the keyboard and a hardware button at once, so
  // track it in a ref too: a second "down" from another source must not re-key.
  const pttRef=useRef(false);
  const setPttState=v=>{pttRef.current=v;setPtt(v)};
  const down=async()=>{if(!connected||pttRef.current||learning)return;setPttState(true);try{await requestPTT(micDeviceId)}catch{setPttState(false)}};
  const up=async()=>{if(!pttRef.current)return;setPttState(false);await releasePTT()};

  // Hardware PTT button (hand mic, foot switch, gamepad), learned once and saved.
  const [pttBinding,setPttBinding]=useState(loadBinding),[learning,setLearningState]=useState(false),[pttCaps,setPttCaps]=useState({global_keys:false,gamepads:false});
  const downRef=useRef(down),upRef=useRef(up);downRef.current=down;upRef.current=up;
  const bindPtt=b=>{setPttBinding(b);saveBinding(b);setHardwareBinding(b)};
  const learnPtt=on=>{setLearningState(on);setLearning(on)};
  useEffect(()=>{
    pttCapabilities().then(setPttCaps);
    setHardwareBinding(loadBinding());
    return listenHardware({
      onPtt:pressed=>pressed?downRef.current():upRef.current(),
      onLearned:b=>{setLearningState(false);setPttBinding(b);saveBinding(b)},
      onLearnCancel:()=>setLearningState(false),
    });
  },[]);

  useEffect(()=>{
    const isPtt=e=>e.code==="Space"||e.code==="Numpad0"||(pttBinding?.kind==="webkey"&&e.code===pttBinding.code);
    const keyDown=e=>{
      // Without a global hook (macOS, Linux) the PTT button is learned from in-window keys.
      if(learning){if(pttCaps.global_keys)return;e.preventDefault();if(e.code==="Escape")learnPtt(false);else{learnPtt(false);bindPtt({kind:"webkey",code:e.code,label:keyLabel(e)})}return}
      if(isPtt(e)&&connected&&!e.repeat){e.preventDefault();down()}
    };
    const keyUp=e=>{if(isPtt(e)){e.preventDefault();up()}};
    window.addEventListener("keydown",keyDown);window.addEventListener("keyup",keyUp);
    return()=>{window.removeEventListener("keydown",keyDown);window.removeEventListener("keyup",keyUp)}
  },[connected,ptt,micDeviceId,learning,pttBinding,pttCaps.global_keys]);

  // Remember audio devices, and pick a hand mic automatically the first time one shows up.
  const touchedRef=useRef(false);
  useEffect(()=>{if(touchedRef.current)writePref("rn-mic",micDeviceId)},[micDeviceId]);
  useEffect(()=>{if(touchedRef.current)writePref("rn-speaker",speakerId)},[speakerId]);
  useEffect(()=>{touchedRef.current=true},[]);
  useEffect(()=>{
    const pick=kind=>devices.find(d=>d.kind===kind&&d.deviceId&&d.deviceId!=="default"&&d.deviceId!=="communications"&&HAND_MIC.test(d.label||""));
    if(readPref("rn-mic")===null){const d=pick("audioinput");if(d)setMicDeviceId(d.deviceId)}
    if(readPref("rn-speaker")===null){const d=pick("audiooutput");if(d)setSpeakerId(d.deviceId)}
  },[devices]);
  const pttName=pttBinding?.label||"";

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
          <section className="hero apx-hero"><div><div className="eyebrow">{channelName.toUpperCase()}</div><h2>Repeater Nation Radio</h2><p className="muted">{displayName}{callsign?" · "+callsign:""}</p></div><button className={connected?"danger":"primary"} onClick={connected?disconnect:connect} disabled={state==="connecting"}><Power size={17}/>{connected?"Disconnect":"Connect"}</button></section>
          <section className="apx-stage">
            <ControlHead
              channelName={channelName} channelNumber={currentChannel?.number} zoneName={currentChannel?.zoneName||zones.find(z=>z.id===zoneId)?.name}
              zones={zones} zoneId={zoneId} visibleChannels={visibleChannels} channelId={channelId}
              state={state} connected={connected} ptt={ptt} muted={muted} error={error} callsign={radioSession?.callsign||callsign} participants={participants}
              incoming={incoming} call={call} callState={callState}
              onPower={connected?disconnect:connect} onMute={()=>setMuted(!muted)} onChannel={selectChannel} onZone={selectZone} onTab={setTab}
              onAnswer={accept} onDecline={decline} onEndCall={endCall}
            />
            <div className="apx-side">
              <PalmMic ptt={ptt} connected={connected} onDown={down} onUp={up} pttName={pttName}/>
              <div className="apx-program">
                <span className="label">PROGRAMMING</span>
                <label>Zone<select value={zoneId} onChange={chooseZone} disabled={!zones.length}><option value="">All Zones</option>{zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
                <label>Channel<select value={channelId} onChange={chooseChannel} disabled={!visibleChannels.length}>{visibleChannels.map(c=><option key={c.id} value={c.id}>{c.name} · CH {c.number}</option>)}</select></label>
                <label>Microphone<select value={micDeviceId} onFocus={refreshDevices} onChange={e=>setMicDeviceId(e.target.value)}><option value="">System default</option>{devices.filter(d=>d.kind==="audioinput").map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||"Microphone"}</option>)}</select></label>
                <label>Speaker<select value={speakerId} onFocus={refreshDevices} onChange={e=>setSpeakerId(e.target.value)}><option value="">System default</option>{devices.filter(d=>d.kind==="audiooutput"&&d.deviceId!=="default").map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||"Speaker"}</option>)}</select></label>
                <PttLearn binding={pttBinding} learning={learning} onLearn={()=>learnPtt(true)} onCancel={()=>learnPtt(false)} onClear={()=>bindPtt(null)}/>
                <div className="apx-program-foot"><span>{participants.length} on channel</span><span>{muted?"Speaker muted":"Speaker on"}</span></div>
              </div>
            </div>
          </section>
          <div className="grid"><section className="panel"><div className="panel-title"><Users size={17}/> Who’s On</div>{participants.length?participants.map(p=><MemberName key={p.identity} participant={p}/>):<div className="empty">{connected?"No other members are currently on this channel.":"Connect to see who’s on."}</div>}</section><section className="panel"><div className="panel-title"><Phone size={17}/> Calls</div>{incoming?<div className="call-card"><strong>Incoming call</strong><span>{incoming.caller_display_name||incoming.caller_callsign||"Member"}</span><div><button className="primary" onClick={accept}><PhoneCall size={16}/> Answer</button><button className="danger" onClick={decline}><PhoneOff size={16}/> Decline</button></div></div>:call?<div className="call-card"><strong>{callState==="calling"?"Calling…":"Call connected"}</strong><span>{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</span><button className="danger" onClick={endCall}><PhoneOff size={16}/> End call</button></div>:<div className="empty">Open Calls to see available members.</div>}</section></div>
        </>}
        {tab==="members"&&<section className="panel full"><div className="panel-title"><Users/> Who’s On — {channelName}</div>{participants.length?participants.map(p=><MemberName key={p.identity} participant={p}/>):<div className="empty">{connected?"No other members are currently on this channel.":"Connect to see who’s on."}</div>}</section>}
        {tab==="calls"&&<section className="panel full"><div className="panel-title"><Phone/> Calls</div>{incoming&&<div className="call-card"><strong>Incoming call</strong><span>{incoming.caller_display_name||incoming.caller_callsign||"Member"}</span><div><button className="primary" onClick={accept}><PhoneCall size={16}/> Answer</button><button className="danger" onClick={decline}><PhoneOff size={16}/> Decline</button></div></div>}{call&&!incoming&&<div className="call-card"><strong>{callState==="calling"?"Calling…":"Call connected"}</strong><span>{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</span><button className="danger" onClick={endCall}><PhoneOff size={16}/> End call</button></div>}<div className="panel-title"><Users size={17}/> Available Members</div>{onlineUsers.length?onlineUsers.map(u=><div className="member" key={u.userId}><div><strong>{u.callsign||u.displayName}</strong><span>{u.channelId?"On radio":"Available"}</span></div><button className="primary" onClick={()=>startCall(u)} disabled={callState!=="idle"}><PhoneCall size={15}/> Call</button></div>):<div className="empty">No other radio members are currently online.</div>}{callError&&<div className="error">{callError}</div>}</section>}
        {tab==="settings"&&<section className="panel full"><div className="panel-title"><Settings/> Radio Settings</div><div className="setting"><span>LiveKit server</span><code>{radioSession?.liveKitUrl||config.livekitUrl}</code></div><div className="setting"><span>Channel</span><strong>{channelName}</strong></div><div className="setting"><span>Account</span><strong>{displayName}{callsign?" · "+callsign:""}</strong></div><div className="setting"><span>PTT</span><strong>Hold Space or Numpad 0{pttName?" or "+pttName:""}</strong></div><div className="setting"><span>PTT button</span><PttLearn binding={pttBinding} learning={learning} onLearn={()=>learnPtt(true)} onCancel={()=>learnPtt(false)} onClear={()=>bindPtt(null)}/></div><UpdateStatus/><button className="danger" onClick={logout}><RefreshCw size={16}/> Sign out / switch account</button></section>}
      </main>
    </div>
  </div>
}

export default function App(){
  const [session,setSession]=useState(null);
  const [authChecking,setAuthChecking]=useState(true);
  useEffect(()=>{
    const handler=e=>setSession(e.detail);
    window.addEventListener("rn-radio-session",handler);
    let unlisten=null,disposed=false;
    const handleDeepLink=async(urls)=>{
      for(const url of urls||[]){
        if(!String(url).startsWith("repeaternation://oauth/")){reportAuthStatus("Ignored an unexpected link: "+String(url).split("?")[0],true);continue}
        const restored=await restoreSessionFromOAuth(url);
        if(restored){
          window.dispatchEvent(new CustomEvent("rn-radio-session",{detail:restored}));
          setSession(restored);
          window.history.replaceState({},document.title,"/");
        }
      }
      setAuthChecking(false);
    };
    // Listen for links first so a getCurrent failure cannot leave the app deaf to the OAuth return.
    onOpenUrl(handleDeepLink).then(fn=>{if(disposed)fn();else unlisten=fn}).catch(err=>reportAuthStatus("This build cannot receive sign-in links: "+(err?.message||err),true));
    (async()=>{
      try{
        const current=await getCurrent();
        if(current?.length){
          await handleDeepLink(current);
          return;
        }
      }catch{}
      const restored=await restoreSessionFromOAuth();
      if(restored) setSession(restored);
      setAuthChecking(false);
    })();
    return()=>{
      disposed=true;
      window.removeEventListener("rn-radio-session",handler);
      if(unlisten) unlisten();
    };
  },[]);
  if(authChecking)return <main className="login-shell"><div className="brand-mark"><Radio size={30}/></div><h1>Repeater Nation Radio</h1><p className="muted">Checking your sign-in…</p></main>;
  return session?<RadioApp session={session} onSignOut={()=>setSession(null)}/>:<Login/>;
}