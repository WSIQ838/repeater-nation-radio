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
import {HAND_MIC,bleConnect,bleDisconnect,bleScan,hwCapabilities,inDesktopApp,listenBle,listenHardware,loadBleDevice,saveBleDevice,setHardwareBindings,setLearning} from "./lib/ptt";
import {ACTIONS,actionLabel,defaultBindings,defaultGlobal,loadKeymap,sameInput,saveKeymap} from "./lib/keymap";
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

const UPDATE_FEED="https://api.github.com/repos/WSIQ838/repeater-nation-radio/releases?per_page=20";

// Turn a failed update check into what actually went wrong. GitHub answers 404 for a
// private repository, so that is not "offline".
async function describeUpdateError(r){
  if(!r)return {pill:"OFFLINE",title:"Update check failed",detail:"Could not reach GitHub. Check your internet connection and try again."};
  if(r.status===404)return {pill:"UNAVAILABLE",title:"Updates can't be checked",detail:"The release page for this app isn't public, so the app can't see new versions."};
  const left=r.headers?.get?.("x-ratelimit-remaining"),reset=Number(r.headers?.get?.("x-ratelimit-reset"));
  if(r.status===429||(r.status===403&&left==="0")){
    const at=reset?new Date(reset*1000).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"";
    return {pill:"LIMITED",title:"Too many update checks",detail:"GitHub's hourly limit was reached"+(at?". Try again after "+at+".":". Try again later.")};
  }
  return {pill:"ERROR",title:"Update check failed",detail:"GitHub answered with error "+r.status+". Try again later."};
}

function UpdateStatus(){
  const [status,setStatus]=useState("checking");
  const [release,setRelease]=useState(null);
  const [failure,setFailure]=useState(null);

  const check=async()=>{
    setStatus("checking");
    let r=null;
    try{
      try{r=await tauriFetch(UPDATE_FEED,{headers:{Accept:"application/vnd.github+json"}})}catch(e){console.error("[update]",e);r=null}
      if(!r?.ok)throw new Error("Update service returned "+(r?.status??"no response"));
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
      setFailure(await describeUpdateError(r?.ok?{status:"bad data"}:r));
      setStatus("error");
    }
  };

  useEffect(()=>{check()},[]);
  const icon=<RefreshCw size={18}/>;
  if(status==="checking")return <div className="update-widget"><div className="channel-head"><div className="update-title">{icon}<div><span className="label">RADIO UPDATE</span><h3>Checking for updates…</h3></div></div><span className="status-pill">CHECKING</span></div><div className="update-display"><div><strong>Repeater Nation Radio</strong><small>Checking the latest published release</small></div></div></div>;
  if(status==="available")return <div className="update-widget"><div className="channel-head"><div className="update-title">{icon}<div><span className="label">RADIO UPDATE</span><h3>Update available</h3></div></div><span className="status-pill">READY</span></div><div className="update-display"><div><strong>Version {release.version}</strong><small>A newer Repeater Nation Radio release is ready.</small></div><span className="rx-dot"/></div><div className="update-actions"><button className="primary" onClick={()=>{const asset=/Windows/i.test(navigator.userAgent)?(release.assets||[]).find(a=>/\.exe$/i.test(a.name)):null;openUrl(asset?.browser_download_url||release.html_url)}}>Install update</button></div></div>;
  if(status==="error")return <div className="update-widget"><div className="channel-head"><div className="update-title">{icon}<div><span className="label">RADIO UPDATE</span><h3>{failure?.title||"Update check failed"}</h3></div></div><span className="status-pill warn">{failure?.pill||"ERROR"}</span></div><div className="update-display"><div><strong>Version {String(__APP_VERSION__)}</strong><small>{failure?.detail||"Try again later."}</small></div></div><div className="update-actions"><button onClick={check}>Check again</button></div></div>;
  return <div className="update-widget"><div className="channel-head"><div className="update-title">{icon}<div><span className="label">RADIO UPDATE</span><h3>Repeater Nation Radio</h3></div></div><span className="status-pill">CURRENT</span></div><div className="update-display"><div><strong>You're up to date · {String(__APP_VERSION__)}</strong><small>You're running the latest published version.</small></div><span className="rx-dot"/></div><div className="update-actions"><button onClick={check}>Check now</button></div></div>;
}

function MemberName({participant}){
  const info=useMemo(()=>{try{return participant?.metadata?JSON.parse(participant.metadata):{}}catch{return {}}},[participant]);
  return <div className="member"><strong>{info.callsign||info.displayName||participant?.name||participant?.identity||"Member"}</strong><span>{info.callsign&&info.displayName?info.displayName:"Connected"}</span></div>
}

const readPref=key=>{try{return localStorage.getItem(key)}catch{return null}};
const writePref=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
const keyLabel=e=>e.code==="Space"?"Space":e.key&&e.key.length===1?e.key.toUpperCase():e.code.replace(/^Key|^Digit/,"");

function PttLearn({bindings,learning,onLearn,onCancel,onEdit}){
  if(learning)return <div className="ptt-learn learning"><span>Press your PTT button… (Esc cancels)</span><button onClick={onCancel}>Cancel</button></div>;
  return <div className="ptt-learn"><span>{bindings.length?"PTT: "+bindings.map(b=>b.label).join(", "):"No PTT button set"}</span><button onClick={onLearn}>Add PTT button</button><button onClick={onEdit}>Edit</button></div>;
}

// Whether a binding can be set to work while the app isn't focused.
const canBeGlobal=(b,caps)=>b.kind==="pad"||b.kind==="ble"||((b.kind==="key"||b.kind==="mouse")&&!!caps?.global_keys);
const GROUPS=[...new Set(ACTIONS.map(a=>a.group))];

function KeyMap({keymap,caps,learnFor,notice,onLearn,onRemove,onToggleGlobal,onReset}){
  return <div className="keymap">
    <p className="muted">Map any radio action to buttons on a keyboard, USB or Bluetooth hand mic, foot switch, mouse or gamepad. Click Add, then press the button. An action can have several buttons. “Anywhere” buttons work even when the app isn't focused.</p>
    {notice&&<div className="keymap-notice">{notice}</div>}
    {GROUPS.map(g=><div key={g} className="keymap-group"><h4>{g}</h4>
      {ACTIONS.filter(a=>a.group===g).map(a=>{
        const list=keymap.map((b,i)=>[b,i]).filter(([b])=>b.action===a.id);
        return <div key={a.id} className={"keymap-row"+(learnFor===a.id?" learning":"")}>
          <span className="keymap-action">{a.label}</span>
          <span className="keymap-binds">
            {list.map(([b,i])=><span key={i} className="keymap-chip"><b>{b.label||b.code}</b>
              {canBeGlobal(b,caps)&&<button className={b.global?"on":""} onClick={()=>onToggleGlobal(i)} title={b.global?"Works even when the app isn't focused":"Works only while the app is focused"}>{b.global?"Anywhere":"App only"}</button>}
              <button onClick={()=>onRemove(i)} aria-label={"Remove "+(b.label||b.code)+" from "+a.label}>×</button></span>)}
            {learnFor===a.id?<span className="keymap-wait">Press a button… <button onClick={()=>onLearn("")}>Cancel</button></span>:<button className="keymap-add" onClick={()=>onLearn(a.id)}>+ Add</button>}
          </span>
        </div>})}
    </div>)}
    <button className="keymap-reset" onClick={onReset}>Reset to defaults</button>
  </div>;
}

const BLE_TEXT={connecting:"Connecting…",connected:"Connected",disconnected:"Reconnecting…",error:"Not connected",off:"Off"};
function BluetoothPtt({status,setStatus}){
  const [device,setDevice]=useState(loadBleDevice),[found,setFound]=useState(null),[scanning,setScanning]=useState(false),[scanError,setScanError]=useState("");
  if(!inDesktopApp())return null;
  const scan=async()=>{setScanning(true);setScanError("");setFound(null);try{setFound(await bleScan())}catch(e){setScanError(String(e?.message||e||"Bluetooth scan failed."))}setScanning(false)};
  const use=d=>{const pick={id:d.id,name:d.name};setDevice(pick);saveBleDevice(pick);setFound(null);bleConnect(pick)};
  const forget=()=>{setDevice(null);saveBleDevice(null);setStatus(null);bleDisconnect()};
  return <div className="ble-ptt">
    <p className="muted">For Bluetooth buttons that the button mapping below doesn't pick up on their own. Pair the button here, then map it below.</p>
    {device?<div className="ble-row"><span><strong>{device.name}</strong> · {BLE_TEXT[status?.state]||"Connecting…"}{status?.state==="error"&&status.message?" · "+status.message:""}</span><button onClick={forget}>Forget</button></div>
      :<div className="ble-row"><span>No Bluetooth button paired</span><button onClick={scan} disabled={scanning}>{scanning?"Searching…":"Find Bluetooth button"}</button></div>}
    {device&&<button className="ble-find" onClick={scan} disabled={scanning}>{scanning?"Searching…":"Find a different button"}</button>}
    {scanError&&<div className="error">{scanError}</div>}
    {found&&(found.length?<ul className="ble-list">{found.map(d=><li key={d.id}><span>{d.name}{d.rssi!=null?` · ${d.rssi} dBm`:""}</span><button onClick={()=>use(d)}>Use</button></li>)}</ul>:<div className="empty">No Bluetooth devices found. Turn the button on and try again.</div>)}
  </div>;
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
  // PTT can be keyed from the palm mic, the keyboard and hardware buttons at once, so
  // track it in a ref too: a second "down" from another source must not re-key.
  const pttRef=useRef(false);
  const setPttState=v=>{pttRef.current=v;setPtt(v)};
  const down=async()=>{if(!connected||pttRef.current||learnFor)return;setPttState(true);try{await requestPTT(micDeviceId)}catch{setPttState(false)}};
  const up=async()=>{if(!pttRef.current)return;setPttState(false);await releasePTT()};

  // Button mapping: every radio action can be bound to keys and hardware buttons.
  const [hwCaps,setHwCaps]=useState(null),[keymap,setKeymap]=useState(null),[learnFor,setLearnFor]=useState(""),[mapNotice,setMapNotice]=useState("");
  const keymapRef=useRef(keymap),learnForRef=useRef(learnFor);keymapRef.current=keymap;learnForRef.current=learnFor;
  const updateKeymap=m=>{setKeymap(m);saveKeymap(m);setHardwareBindings(m)};
  const learn=id=>{setLearnFor(id);setMapNotice("");setLearning(!!id)};
  const addLearned=input=>{
    const action=learnForRef.current,map=keymapRef.current||[];
    if(!action)return;
    setLearnFor("");
    if(map.some(b=>sameInput(b,input)&&b.action===action)){setMapNotice(`${input.label} is already mapped to ${actionLabel(action)}.`);return}
    const moved=map.find(b=>sameInput(b,input));
    updateKeymap(map.filter(b=>!sameInput(b,input)).concat({action,...input,global:defaultGlobal(input)}));
    setMapNotice(moved?`${input.label} moved from ${actionLabel(moved.action)} to ${actionLabel(action)}.`:`${input.label} mapped to ${actionLabel(action)}.`);
  };
  const stepIn=(list,currentId,dir)=>{if(!list.length)return null;const at=list.findIndex(x=>x.id===currentId);const from=at<0&&dir<0?0:at;return list[(from+dir+list.length)%list.length]};
  const [faceCommand,setFaceCommand]=useState(null);
  const runAction=action=>{
    if(action==="channel_up"||action==="channel_down"){const c=stepIn(visibleChannels,channelId,action==="channel_up"?1:-1);if(c)selectChannel(c.id)}
    else if(action==="zone_up"||action==="zone_down"){const z=stepIn(zones,zoneId,action==="zone_up"?1:-1);if(z)selectZone(z.id)}
    else if(/^p[1-5]$/.test(action)){const c=visibleChannels[Number(action[1])-1];if(c)selectChannel(c.id)}
    else if(action==="power"){if(state!=="connecting")(connected?disconnect():connect()).catch(()=>{})}
    else if(action==="mute")setMuted(!muted);
    else if(action==="answer"){if(incoming)accept()}
    else if(action==="decline"){if(incoming)decline()}
    else if(action==="end_call"){if(call)endCall()}
    else{if(action==="home"||tab!=="radio")setTab("radio");setFaceCommand({action})}
  };
  const downRef=useRef(down),upRef=useRef(up),runRef=useRef(runAction);downRef.current=down;upRef.current=up;runRef.current=runAction;
  const handleAction=({action,pressed,global})=>{
    if(action==="ptt"){pressed?downRef.current():upRef.current();return}
    if(!pressed||learnForRef.current||(!global&&!document.hasFocus()))return;
    runRef.current(action);
  };
  const handleRef=useRef(handleAction);handleRef.current=handleAction;
  // A paired Bluetooth button reconnects at startup, whichever tab is open.
  const [bleStatus,setBleStatus]=useState(null);
  useEffect(()=>{const off=listenBle(setBleStatus);const saved=loadBleDevice();if(saved)bleConnect(saved);return off},[]);
  useEffect(()=>{
    let alive=true;
    hwCapabilities().then(caps=>{if(!alive)return;const map=loadKeymap(caps.global_keys);setHwCaps(caps);setKeymap(map);setHardwareBindings(map)});
    const off=listenHardware({
      onAction:a=>handleRef.current(a),
      onLearned:input=>addLearnedRef.current(input),
      onLearnCancel:()=>setLearnFor(""),
    });
    return()=>{alive=false;off()};
  },[]);
  const addLearnedRef=useRef(addLearned);addLearnedRef.current=addLearned;

  useEffect(()=>{
    if(!keymap)return;
    const web=keymap.filter(b=>b.kind==="webkey"),nativeKeys=new Set(keymap.filter(b=>b.kind==="key").map(b=>Number(b.code)));
    const typing=e=>/^(INPUT|TEXTAREA)$/.test(e.target?.tagName||"");
    const keyDown=e=>{
      // Without the Windows hook, buttons are learned from in-window keys.
      if(learnFor){if(hwCaps?.global_keys)return;e.preventDefault();if(e.code==="Escape")learn("");else addLearned({kind:"webkey",code:e.code,label:keyLabel(e)});return}
      if(typing(e))return;
      // Keys mapped through the Windows hook are handled there; just keep them from the page.
      if(nativeKeys.has(e.keyCode)){e.preventDefault();return}
      const hits=web.filter(b=>b.code===e.code);if(!hits.length)return;
      e.preventDefault();if(e.repeat)return;
      hits.forEach(b=>handleAction({action:b.action,pressed:true,global:true}));
    };
    const keyUp=e=>{
      if(typing(e))return;
      if(nativeKeys.has(e.keyCode)){e.preventDefault();return}
      const hits=web.filter(b=>b.code===e.code);if(!hits.length)return;
      e.preventDefault();hits.forEach(b=>handleAction({action:b.action,pressed:false,global:true}));
    };
    window.addEventListener("keydown",keyDown);window.addEventListener("keyup",keyUp);
    return()=>{window.removeEventListener("keydown",keyDown);window.removeEventListener("keyup",keyUp)}
  },[keymap,learnFor,hwCaps]);

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
  const pttBindings=(keymap||[]).filter(b=>b.action==="ptt"),pttName=pttBindings.map(b=>b.label||b.code).join(" / ");
  const keymapProps={keymap:keymap||[],caps:hwCaps,learnFor,notice:mapNotice,onLearn:learn,onRemove:i=>updateKeymap(keymap.filter((_,k)=>k!==i)),onToggleGlobal:i=>updateKeymap(keymap.map((b,k)=>k===i?{...b,global:!b.global}:b)),onReset:()=>{updateKeymap(defaultBindings(!!hwCaps?.global_keys));setMapNotice("Button mapping reset to defaults.")}};

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
              onAnswer={accept} onDecline={decline} onEndCall={endCall} command={faceCommand}
            />
            <div className="apx-side">
              <PalmMic ptt={ptt} connected={connected} onDown={down} onUp={up} pttName={pttName}/>
              <div className="apx-program">
                <span className="label">PROGRAMMING</span>
                <label>Zone<select value={zoneId} onChange={chooseZone} disabled={!zones.length}><option value="">All Zones</option>{zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
                <label>Channel<select value={channelId} onChange={chooseChannel} disabled={!visibleChannels.length}>{visibleChannels.map(c=><option key={c.id} value={c.id}>{c.name} · CH {c.number}</option>)}</select></label>
                <label>Microphone<select value={micDeviceId} onFocus={refreshDevices} onChange={e=>setMicDeviceId(e.target.value)}><option value="">System default</option>{devices.filter(d=>d.kind==="audioinput").map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||"Microphone"}</option>)}</select></label>
                <label>Speaker<select value={speakerId} onFocus={refreshDevices} onChange={e=>setSpeakerId(e.target.value)}><option value="">System default</option>{devices.filter(d=>d.kind==="audiooutput"&&d.deviceId!=="default").map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||"Speaker"}</option>)}</select></label>
                <PttLearn bindings={pttBindings} learning={learnFor==="ptt"} onLearn={()=>learn("ptt")} onCancel={()=>learn("")} onEdit={()=>setTab("settings")}/>
                <div className="apx-program-foot"><span>{participants.length} on channel</span><span>{muted?"Speaker muted":"Speaker on"}</span></div>
              </div>
            </div>
          </section>
          <div className="grid"><section className="panel"><div className="panel-title"><Users size={17}/> Who’s On</div>{participants.length?participants.map(p=><MemberName key={p.identity} participant={p}/>):<div className="empty">{connected?"No other members are currently on this channel.":"Connect to see who’s on."}</div>}</section><section className="panel"><div className="panel-title"><Phone size={17}/> Calls</div>{incoming?<div className="call-card"><strong>Incoming call</strong><span>{incoming.caller_display_name||incoming.caller_callsign||"Member"}</span><div><button className="primary" onClick={accept}><PhoneCall size={16}/> Answer</button><button className="danger" onClick={decline}><PhoneOff size={16}/> Decline</button></div></div>:call?<div className="call-card"><strong>{callState==="calling"?"Calling…":"Call connected"}</strong><span>{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</span><button className="danger" onClick={endCall}><PhoneOff size={16}/> End call</button></div>:<div className="empty">Open Calls to see available members.</div>}</section></div>
        </>}
        {tab==="members"&&<section className="panel full"><div className="panel-title"><Users/> Who’s On — {channelName}</div>{participants.length?participants.map(p=><MemberName key={p.identity} participant={p}/>):<div className="empty">{connected?"No other members are currently on this channel.":"Connect to see who’s on."}</div>}</section>}
        {tab==="calls"&&<section className="panel full"><div className="panel-title"><Phone/> Calls</div>{incoming&&<div className="call-card"><strong>Incoming call</strong><span>{incoming.caller_display_name||incoming.caller_callsign||"Member"}</span><div><button className="primary" onClick={accept}><PhoneCall size={16}/> Answer</button><button className="danger" onClick={decline}><PhoneOff size={16}/> Decline</button></div></div>}{call&&!incoming&&<div className="call-card"><strong>{callState==="calling"?"Calling…":"Call connected"}</strong><span>{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</span><button className="danger" onClick={endCall}><PhoneOff size={16}/> End call</button></div>}<div className="panel-title"><Users size={17}/> Available Members</div>{onlineUsers.length?onlineUsers.map(u=><div className="member" key={u.userId}><div><strong>{u.callsign||u.displayName}</strong><span>{u.channelId?"On radio":"Available"}</span></div><button className="primary" onClick={()=>startCall(u)} disabled={callState!=="idle"}><PhoneCall size={15}/> Call</button></div>):<div className="empty">No other radio members are currently online.</div>}{callError&&<div className="error">{callError}</div>}</section>}
        {tab==="settings"&&<section className="panel full"><div className="panel-title"><Settings/> Radio Settings</div><div className="setting"><span>LiveKit server</span><code>{radioSession?.liveKitUrl||config.livekitUrl}</code></div><div className="setting"><span>Channel</span><strong>{channelName}</strong></div><div className="setting"><span>Account</span><strong>{displayName}{callsign?" · "+callsign:""}</strong></div>{inDesktopApp()&&<div className="setting ble-setting"><span>Bluetooth button</span><BluetoothPtt status={bleStatus} setStatus={setBleStatus}/></div>}<div className="setting keymap-setting"><span>Button mapping</span><KeyMap {...keymapProps}/></div><UpdateStatus/><button className="danger" onClick={logout}><RefreshCw size={16}/> Sign out / switch account</button></section>}
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