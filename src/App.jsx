import {useEffect,useMemo,useRef,useState} from "react";
import {zoneLabel} from "./lib/labels";
import {Radio,Users,Phone,Settings,LogIn,ChevronDown,Flag,PhoneCall,PhoneOff,RefreshCw,Minimize2,LayoutGrid,Volume2,VolumeX,Mic,History,Play,Square,Trash2} from "lucide-react";
import {config} from "./lib/config";
import {loginWithPassword,loginWithGoogle,restoreSession,restoreSessionFromOAuth,reportAuthStatus,clearSession,listRadioChannels} from "./lib/auth";
import {openUrl} from "@tauri-apps/plugin-opener";
import {fetch as tauriFetch} from "@tauri-apps/plugin-http";
import {getCurrent,onOpenUrl} from "@tauri-apps/plugin-deep-link";
import {useRadio} from "./hooks/useRadio";
import {useDirectCalls} from "./hooks/useDirectCalls";
import {SCAN_MAX,useScan} from "./hooks/useScan";
import {canShareStatus,prewarmRadio,shareStatus} from "./lib/livekit";
import {HAND_MIC,bleConnect,bleDisconnect,bleScan,hwCapabilities,inDesktopApp,listenBle,listenHardware,loadBleDevice,saveBleDevice,setHardwareBindings,setLearning,setMicButtons} from "./lib/ptt";
import {ACTIONS,actionLabel,defaultBindings,defaultGlobal,loadKeymap,sameInput,saveKeymap} from "./lib/keymap";
import {PalmMic} from "./components/ControlHead";
import {MiniRadio} from "./components/MiniRadio";
import {IS_PHONE,PhoneApp} from "./components/PhoneApp";
import {FACES,RadioFace,loadFace,saveFace} from "./components/RadioFaces";
import {STATUSES,statusClass} from "./lib/status";
import {appInBackground,listenTray,notify,setMiniWindow,setTray} from "./lib/desktop";
import {clearTraffic,deleteTraffic,getAudio,listTraffic,loadTrafficSettings,onTrafficChange,prune,recordTrack,saveTrafficSettings,saveTransmission} from "./lib/traffic";
import {setSink} from "./hooks/useRadio";
import {DEFAULT_VOLUME,volumeGain,announce,canAnnounce,GOOGLE_VOICES,isGoogleVoice,listVoices,loadFeatures,loadVolumes,playTone,ROGER_TONES,rogerSteps,saveFeatures,saveVolumes} from "./lib/tones";
import {VOICE_FX,previewVoiceFx,setVoiceFx,voiceFx} from "./lib/voicefx";
import "./apx.css";

const AUTO_CONNECT_SETTLE_MS=350;

function Login({notice=""}){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [googleBusy,setGoogleBusy]=useState(false);
  const [authStatus,setAuthStatus]=useState(notice?{message:notice,error:true}:null);
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
    <p className="fine">Use the same Repeater Nation account you use on the website. The app will not silently reuse an old session at startup, so you always have a visible sign-in screen.</p>
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

function RadioFeatures({features,setFeature,hasTray,onTest}){
  const [voices,setVoices]=useState([]),[voiceNote,setVoiceNote]=useState("");
  useEffect(()=>listVoices(setVoices),[]);
  const google=isGoogleVoice(features.announceVoice);
  const testVoice=async()=>{setVoiceNote("");const how=await onTest("announce");if(how==="fallback")setVoiceNote("Google's voice didn't answer (no internet?), so the computer's voice was used.");else if(!how)setVoiceNote("This voice couldn't play.")};
  return <div className="features">
    <label>Talk-permit tone<input type="checkbox" checked={features.permitTone} onChange={e=>setFeature("permitTone",e.target.checked)}/></label>
    <label>Busy tone<input type="checkbox" checked={features.busyTone} onChange={e=>setFeature("busyTone",e.target.checked)}/></label>
    <label>Roger beep after each received transmission<span className="feature-pick">
      <select aria-label="Roger beep" value={features.rogerBeep?features.rogerTone||"classic":"off"} onChange={e=>{setFeature("rogerTone",e.target.value);setFeature("rogerBeep",e.target.value!=="off")}}>{ROGER_TONES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select>
      <button type="button" className="feature-test" onClick={()=>onTest("roger")} disabled={!features.rogerBeep||features.rogerTone==="off"}>Test</button></span></label>
    <label>Voice filter (how received voices sound)<span className="feature-pick">
      <select aria-label="Voice filter" value={features.voiceFx||"clean"} onChange={e=>setFeature("voiceFx",e.target.value)}>{VOICE_FX.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select>
      <button type="button" className="feature-test" onClick={()=>onTest("fx")}>Test</button></span></label>
    <label>Time-out timer<select value={features.tot} onChange={e=>setFeature("tot",Number(e.target.value))}>{[[0,"Off"],[30,"30 s"],[60,"60 s"],[120,"2 min"],[180,"3 min"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label>Tone volume<input type="range" min="0" max="1" step="0.1" value={features.toneVolume} onChange={e=>setFeature("toneVolume",Number(e.target.value))}/></label>
    <label>Keypad tones (a beep when you press a key on the radio)<span className="feature-pick">
      <input type="range" aria-label="Keypad tone volume" min="0.1" max="1" step="0.1" value={features.keyToneVolume??0.5} disabled={!features.keyTones} onChange={e=>setFeature("keyToneVolume",Number(e.target.value))}/>
      <button type="button" className="feature-test" onClick={()=>onTest("key")} disabled={!features.keyTones}>Test</button>
      <input type="checkbox" aria-label="Keypad tones" checked={features.keyTones!==false} onChange={e=>setFeature("keyTones",e.target.checked)}/></span></label>
    <label>Notify incoming calls when the radio is in the background<input type="checkbox" checked={features.notifyCalls} onChange={e=>setFeature("notifyCalls",e.target.checked)}/></label>
    <label>Notify when someone talks while the radio is in the background<input type="checkbox" checked={features.notifyTalk} onChange={e=>setFeature("notifyTalk",e.target.checked)}/></label>
    {hasTray&&<label>Close button keeps the radio running in the tray<input type="checkbox" checked={features.closeToTray} onChange={e=>setFeature("closeToTray",e.target.checked)}/></label>}
    <label>Announce channel changes{canAnnounce()?<input type="checkbox" checked={features.announce} onChange={e=>setFeature("announce",e.target.checked)}/>:<small>Not available on this system</small>}</label>
    {canAnnounce()&&<div className="feature-sub">
      <label>Announce voice<span className="feature-pick">
        <select aria-label="Announce voice" value={features.announceVoice||""} onChange={e=>setFeature("announceVoice",e.target.value)}>
          <option value="">Computer's default voice</option>
          {!!voices.length&&<optgroup label="On this computer">{voices.map(v=><option key={v.id} value={v.id}>{v.name}{v.lang?` (${v.lang})`:""}</option>)}</optgroup>}
          <optgroup label="Google (needs internet)">{GOOGLE_VOICES.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>
        </select>
        <button type="button" className="feature-test" onClick={testVoice}>Test</button></span></label>
      <label>Voice speed<span className="feature-pick"><input type="range" aria-label="Voice speed" min="0.6" max="1.6" step="0.05" value={features.announceRate??1.05} onChange={e=>setFeature("announceRate",Number(e.target.value))}/><small className="feature-val">{Number(features.announceRate??1.05).toFixed(2)}×</small></span></label>
      <label>Voice pitch<span className="feature-pick"><input type="range" aria-label="Voice pitch" min="0.5" max="1.8" step="0.05" value={features.announcePitch??1} disabled={google} title={google?"Pitch works with the computer's voices":undefined} onChange={e=>setFeature("announcePitch",Number(e.target.value))}/><small className="feature-val">{Number(features.announcePitch??1).toFixed(2)}</small></span></label>
      {google&&<small>Google voices need the internet; pitch only changes the computer's voices.</small>}
      {voiceNote&&<small className="feature-note">{voiceNote}</small>}
    </div>}
  </div>;
}

const SCAN_KEY="rn-scan";
const loadScan=()=>{try{const v=JSON.parse(localStorage.getItem(SCAN_KEY));if(v&&Array.isArray(v.list))return v}catch{}return null};
const saveScan=v=>{try{localStorage.setItem(SCAN_KEY,JSON.stringify(v))}catch{}};

function ScanList({channels,zones,scan,setScan,status,errors={}}){
  const toggle=id=>{const has=scan.list.includes(id);if(!has&&scan.list.length>=SCAN_MAX)return;setScan({...scan,list:has?scan.list.filter(x=>x!==id):[...scan.list,id]})};
  return <div className="features">
    <small>Scan listens to every channel ticked here and plays whichever one has someone talking (up to {SCAN_MAX}). Your selected channel always comes first, and PTT always talks on the selected channel.</small>
    {zones.map(z=><div key={z.id}><strong className="scan-zone">{z.name}</strong>{channels.filter(c=>c.zoneId===z.id).map(c=><label key={c.id}>{c.name} · CH {c.number}{status[c.id]==="error"||status[c.id]==="failed"?` (can't join${errors[c.id]?": "+errors[c.id]:""})`:""}<input type="checkbox" checked={scan.list.includes(c.id)} onChange={()=>toggle(c.id)}/></label>)}</div>)}
    <label>Priority channel<select value={scan.priority||""} onChange={e=>setScan({...scan,priority:e.target.value})}><option value="">None</option>{channels.filter(c=>scan.list.includes(c.id)).map(c=><option key={c.id} value={c.id}>{c.zoneName} · {c.name}</option>)}</select></label>
  </div>;
}

// Monitor console: several channels heard at once, each with its own level and mute,
// like a dispatch console. PTT talks on the selected channel; any tile can be selected.
const CONSOLE_KEY="rn-console";
const loadConsole=()=>{try{const v=JSON.parse(localStorage.getItem(CONSOLE_KEY));if(v&&Array.isArray(v.list))return {muted:[],...v}}catch{}return null};
const saveConsole=v=>{try{localStorage.setItem(CONSOLE_KEY,JSON.stringify(v))}catch{}};
const ago=at=>{const s=Math.round((Date.now()-at)/1000);return s<60?s+" s ago":s<3600?Math.round(s/60)+" min ago":new Date(at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})};

function ConsoleTile({channel,selected,talker,last,status,error="",level,off,state,onLevel,onMute,onSelect}){
  const tx=selected&&state==="transmitting";
  const line=tx?"Transmitting":talker?"RX · "+talker:status==="connecting"?"Joining…":status==="reconnecting"?"Reconnecting…":status==="error"?"Can't join, retrying":status==="failed"?"Can't join: "+(error||"not allowed"):last?`Last: ${last.name} · ${ago(last.at)}`:"Quiet";
  return <div className={"console-tile"+(selected?" selected":"")+(tx?" tx":talker?" rx":"")+(off?" off":"")}>
    <div className="console-tile-head"><span>{channel.zoneName} · CH {channel.number}</span>{selected?<b>TX</b>:<button type="button" onClick={onSelect} title="Talk on this channel">Select</button>}</div>
    <strong>{channel.name}</strong>
    <div className="console-line" title={status==="error"||status==="failed"?error:undefined}>{line}</div>
    <div className="console-level">
      <button type="button" className="mini-icon" onClick={onMute} title={off?"Unmute":"Mute"} aria-label={off?"Unmute "+channel.name:"Mute "+channel.name}>{off?<VolumeX size={15}/>:<Volume2 size={15}/>}</button>
      <input type="range" min="0" max="10" step="1" value={level} onChange={e=>onLevel(Number(e.target.value))} aria-label={"Volume "+channel.name}/>
      <span>{level}</span>
    </div>
  </div>;
}

function ConsoleView({channels,zones,cfg,setCfg,on,onToggle,onSelect,connected,selectedId,activity,mainTalker,lastTalk,status,errors={},volumes,onLevel,onMuteSelected,muted,state,ptt,onDown,onUp,pttName}){
  const [editing,setEditing]=useState(false);
  const toggle=id=>{const has=cfg.list.includes(id);if(!has&&cfg.list.length>=SCAN_MAX)return;setCfg({...cfg,list:has?cfg.list.filter(x=>x!==id):[...cfg.list,id]})};
  const tiles=[channels.find(c=>c.id===selectedId),...cfg.list.filter(id=>id!==selectedId).map(id=>channels.find(c=>c.id===id))].filter(Boolean);
  return <section className="panel full console">
    <div className="panel-title"><LayoutGrid size={17}/> Monitor console
      <span className="console-actions">
        <button type="button" className={on?"danger":"primary"} onClick={onToggle} disabled={!connected&&!on}>{on?"Stop monitoring":"Monitor all"}</button>
        <button type="button" onClick={()=>setEditing(v=>!v)}>{editing?"Done":"Edit channels"}</button>
      </span>
    </div>
    {!connected&&<div className="empty">Connect the radio to monitor channels.</div>}
    {editing&&<div className="features console-edit">
      <small>Tick up to {SCAN_MAX} channels to hear at the same time as your selected channel. Scan turns off while the console is monitoring.</small>
      {zones.map(z=><div key={z.id}><strong className="scan-zone">{z.name}</strong>{channels.filter(c=>c.zoneId===z.id).map(c=><label key={c.id}>{c.name} · CH {c.number}<input type="checkbox" checked={cfg.list.includes(c.id)} onChange={()=>toggle(c.id)}/></label>)}</div>)}
    </div>}
    <div className="console-ptt">
      <button type="button" className={ptt?"mini-ptt pressed":"mini-ptt"} disabled={!connected}
        onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture?.(e.pointerId);onDown()}} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp} onContextMenu={e=>e.preventDefault()}>
        <Mic size={16}/> PTT on {channels.find(c=>c.id===selectedId)?.name||"selected channel"}
      </button>
      <small>{pttName?"or "+pttName:""}</small>
    </div>
    <div className="console-grid">{tiles.map(c=>{
      const sel=c.id===selectedId,offIds=cfg.muted||[];
      return <ConsoleTile key={c.id} channel={c} selected={sel} state={state}
        talker={sel?mainTalker:on?activity[c.id]:""} last={lastTalk[c.id]} status={sel?(connected?"on":state):on?status[c.id]:""} error={sel?"":errors[c.id]||""}
        level={volumes[c.id]??DEFAULT_VOLUME} off={sel?muted:!on||offIds.includes(c.id)}
        onLevel={v=>onLevel(c.id,v)} onSelect={()=>onSelect(c.id)}
        onMute={()=>sel?onMuteSelected():setCfg({...cfg,muted:offIds.includes(c.id)?offIds.filter(x=>x!==c.id):[...offIds,c.id]})}/>;
    })}</div>
  </section>;
}

// Traffic log: every recorded transmission, newest first, with playback.
const fmtMs=ms=>{const s=Math.max(1,Math.round(ms/1000));return s<60?s+" s":Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};
const fmtMB=b=>(b/1048576).toFixed(b<10485760?1:0)+" MB";
function TrafficLog({channels,settings,setSettings,speakerId,volume}){
  const [items,setItems]=useState([]),[error,setError]=useState(""),[filter,setFilter]=useState(""),[search,setSearch]=useState(""),[playing,setPlaying]=useState(""),[continuous,setContinuous]=useState(false);
  const audioRef=useRef(null),listRef=useRef([]),contRef=useRef(continuous);contRef.current=continuous;
  useEffect(()=>{
    let alive=true;
    const load=()=>listTraffic().then(x=>{if(alive){setItems(x);setError("")}}).catch(e=>alive&&setError(e.message||"Recordings can't be read on this system."));
    prune().catch(()=>{});load();
    const off=onTrafficChange(load);
    return()=>{alive=false;off();stop()};
  },[]);
  const shown=items.filter(x=>(!filter||x.channelId===filter)&&(!search||x.name.toLowerCase().includes(search.toLowerCase())));
  listRef.current=shown;
  const stop=()=>{const a=audioRef.current;audioRef.current=null;if(a){a.pause();URL.revokeObjectURL(a.src)}setPlaying("")};
  const play=async id=>{
    stop();
    const blob=await getAudio(id).catch(()=>null);if(!blob)return;
    const a=new Audio(URL.createObjectURL(blob));a.volume=volume;setSink(a,speakerId);audioRef.current=a;setPlaying(id);
    a.onended=()=>{
      if(audioRef.current!==a)return;stop();
      // Continuous playback runs forward in time (up the newest-first list).
      const list=listRef.current,at=list.findIndex(x=>x.id===id);
      if(contRef.current&&at>0)play(list[at-1].id);
    };
    a.play().catch(()=>stop());
  };
  const used=items.reduce((n,x)=>n+(x.size||0),0);
  let day="";
  return <section className="panel full traffic">
    <div className="panel-title"><History size={17}/> Traffic log<span className="traffic-used">{items.length} recordings · {fmtMB(used)} of {settings.maxMB} MB</span></div>
    <div className="traffic-bar">
      <label><input type="checkbox" checked={settings.enabled} onChange={e=>setSettings({...settings,enabled:e.target.checked})}/> Record all traffic</label>
      <label>Keep<select value={settings.days} onChange={e=>setSettings({...settings,days:Number(e.target.value)})}>{[1,7,30,90].map(d=><option key={d} value={d}>{d===1?"1 day":d+" days"}</option>)}</select></label>
      <label>Channel<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All</option>{channels.map(c=><option key={c.id} value={c.id}>{c.zoneName} · {c.name}</option>)}</select></label>
      <input type="search" placeholder="Search callsign or name" value={search} onChange={e=>setSearch(e.target.value)}/>
      <label><input type="checkbox" checked={continuous} onChange={e=>setContinuous(e.target.checked)}/> Play continuously</label>
      <button type="button" className="traffic-clear" disabled={!items.length} onClick={()=>{if(window.confirm("Delete every recording in the traffic log?")){stop();clearTraffic()}}}><Trash2 size={14}/> Clear all</button>
    </div>
    {error&&<div className="error">{error}</div>}
    {!shown.length?<div className="empty">{items.length?"No recordings match.":settings.enabled?"Transmissions on your selected, scanned and console channels are recorded here, including your own.":"Recording is off."}</div>
    :<div className="traffic-list">{shown.map(x=>{
      const d=new Date(x.at).toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"}),head=d!==day?(day=d):null;
      return <div key={x.id}>{head&&<div className="traffic-day">{head}</div>}
        <div className={"traffic-row"+(playing===x.id?" playing":"")+(x.own?" own":"")}>
          <button type="button" className="mini-icon" onClick={()=>playing===x.id?stop():play(x.id)} aria-label={playing===x.id?"Stop":"Play"}>{playing===x.id?<Square size={14}/>:<Play size={14}/>}</button>
          <span className="traffic-time">{new Date(x.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span>
          <strong>{x.own?"You":x.name}</strong>
          <span className="traffic-ch">{x.zone?x.zone+" · ":""}{x.channel}</span>
          <span className="traffic-len">{fmtMs(x.ms)}</span>
          <button type="button" className="mini-icon" onClick={()=>{if(playing===x.id)stop();deleteTraffic(x.id)}} aria-label="Delete recording"><Trash2 size={14}/></button>
        </div></div>;
    })}</div>}
  </section>;
}

function LastHeard({items,onReplay}){
  return <section className="panel last-heard"><div className="panel-title"><RefreshCw size={17}/> Last heard</div>
    {items.length?items.map(x=><div className="member" key={x.id}><div><strong>{x.name}</strong><span>{new Date(x.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})} · {Math.max(1,Math.round(x.ms/1000))} s</span></div><button onClick={()=>onReplay(x.id)} disabled={!x.url} title={x.url?"Play this transmission again":"Replay isn't available on this system"}>Replay</button></div>)
      :<div className="empty">Transmissions you hear show up here, with instant replay.</div>}
  </section>;
}

function MemberName({participant,talking}){
  const info=useMemo(()=>{try{return participant?.metadata?JSON.parse(participant.metadata):{}}catch{return {}}},[participant]);
  const status=participant?.attributes?.status||"";
  return <div className="member"><strong>{info.callsign||info.displayName||participant?.name||participant?.identity||"Member"}</strong>{status&&<em className={"status-chip "+statusClass(status)}>{status}</em>}<span className={talking?"talking":""}>{talking?"Transmitting":info.callsign&&info.displayName?info.displayName:"Connected"}</span></div>
}

// Member status, shown next to your name on every radio on the channel.
const STATUS_KEY="rn-status";
function StatusButtons({status,onStatus,shared,connected}){
  return <div className="status-panel">
    <div className="status-buttons">{STATUSES.map(s=><button type="button" key={s} className={(s===status?"on ":"")+statusClass(s)} onClick={()=>onStatus(s===status?"":s)}>{s}</button>)}</div>
    <small>{!status?"Pick a status to show it next to your name.":!connected?"Shown to others once you connect.":shared?"Other radios on this channel see your status.":"Only shown on this radio for now: the radio server doesn't let the app share it yet."}</small>
  </div>;
}

const readPref=key=>{try{return localStorage.getItem(key)}catch{return null}};
const writePref=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
// The Windows virtual-key code for a key event, matching what the native hook reports
// (left and right Shift, Ctrl and Alt are separate keys there).
const SIDE_VK={ShiftLeft:0xA0,ShiftRight:0xA1,ControlLeft:0xA2,ControlRight:0xA3,AltLeft:0xA4,AltRight:0xA5};
// Number-pad digits count as Num 0–9 whether Num Lock is on or off.
const keyVk=e=>{const pad=/^Numpad(\d)$/.exec(e.code||"");return pad?0x60+Number(pad[1]):SIDE_VK[e.code]??e.keyCode};
const MIC_PTT={MediaFastForward:true,MediaRewind:false};// speaker-mic PTT down / up (see micPtt)
const MEDIA_LABEL={AudioVolumeMute:"Mute key",AudioVolumeDown:"Volume Down key",AudioVolumeUp:"Volume Up key",MediaTrackNext:"Next Track key",MediaTrackPrevious:"Previous Track key",MediaStop:"Stop key",MediaPlayPause:"Play/Pause key",BrowserBack:"Browser Back",BrowserForward:"Browser Forward"};
const keyLabel=e=>MEDIA_LABEL[e.code]||(e.code==="Space"?"Space":e.key&&e.key.length===1?e.key.toUpperCase():e.code.replace(/^Key|^Digit/,""));

// Whether a binding can be set to work while the app isn't focused.
const canBeGlobal=(b,caps)=>b.kind==="pad"||b.kind==="ble"||((b.kind==="key"||b.kind==="mouse")&&!!caps?.global_keys);
const GROUPS=[...new Set(ACTIONS.map(a=>a.group))];

function KeyMap({keymap,caps,learnFor,notice,onLearn,onRemove,onToggleGlobal,onReset}){
  return <div className="keymap">
    <p className="muted">Map any radio action to buttons on a keyboard, USB or Bluetooth hand mic, foot switch, mouse or gamepad. Click Add, then press the button. An action can have several buttons. “Anywhere” buttons work even when the app isn't focused. Keyboard keys start as “App only” so typing elsewhere doesn't key the radio; click “App only” on a key to make it work anywhere. Bluetooth speaker mics made for Zello (Abbree and similar) key up on their own once paired with this computer or phone: there's nothing to add.</p>
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
  const zones=useMemo(()=>Array.from(new Map(channels.filter(c=>c.zoneId).map(c=>[c.zoneId,{id:c.zoneId,name:c.zoneName||"Radio",order:c.zoneOrder??999}])).values()).sort((a,b)=>a.order-b.order),[channels]);
  // What the channel announcement says: "Zone ALL, channel 1, Nation Wide".
  const announceText=c=>{const z=String(zones.find(x=>x.id===c.zoneId)?.name||c.zoneName||"").trim();return `${z?zoneLabel(z)+", ":""}channel ${c.number??""}, ${c.name}`};
  const visibleChannels=useMemo(()=>zoneId?channels.filter(c=>c.zoneId===zoneId):channels,[channels,zoneId]);
  // Radio features: tones, time-out timer, announcements and per-channel volume.
  const [features,setFeatures]=useState(loadFeatures),featuresRef=useRef(features);featuresRef.current=features;
  const setFeature=(k,v)=>{if(k==="voiceFx")setVoiceFx(v);setFeatures(f=>{const next={...f,[k]:v};saveFeatures(next);return next})};
  // The voice filter lives in voicefx.js (it reroutes audio already playing); start it from the saved choice.
  useEffect(()=>{if(features.voiceFx&&features.voiceFx!==voiceFx())setVoiceFx(features.voiceFx)},[]);
  const [volumes,setVolumes]=useState(loadVolumes);
  const volume=volumes[channelId]??DEFAULT_VOLUME,volumeRef=useRef(volume);volumeRef.current=volume;
  const [flash,setFlash]=useState(null);
  // Which radio is drawn (control head, handheld, mobile). All of them work the same.
  const [face,setFace]=useState(loadFace);
  const chooseFace=v=>{setFace(v);saveFace(v)};
  const tone=(name,steps=null)=>playTone(name,featuresRef.current.toneVolume*Math.max(0.3,volumeRef.current/10),steps);
  // Test buttons in Settings: hear the roger beep, the voice filter or the announce voice.
  const testFeature=what=>{
    const f=featuresRef.current;
    if(what==="roger")tone("roger",rogerSteps(f.rogerTone));
    else if(what==="key")playTone("key",f.keyToneVolume??0.5);
    else if(what==="fx")previewVoiceFx(f.voiceFx||"clean",Math.max(0.3,volumeGain(volumeRef.current)));
    else if(what==="announce"){const c=currentChannelRef.current;return announce(c?announceText(c):"Zone one, channel one, Nation Wide",{voice:f.announceVoice,rate:f.announceRate,pitch:f.announcePitch})}
  };
  // Keypad tones: a short Motorola-style beep when any key on a radio face, the palm mic or the
  // mini radio is pressed. PTT keys and knobs stay quiet, like on the real radios.
  useEffect(()=>{
    const KEYS=".apx-stage, .mini-radio";
    const QUIET='.apx-knob, [class*="ptt"], [aria-label*="PTT"], [aria-label*="ush to talk"], [title*="ush to talk"]';
    const beep=target=>{
      const f=featuresRef.current;if(f.keyTones===false)return;
      const el=target?.closest?.('button, [role="button"]');
      if(!el||el.disabled||el.getAttribute("aria-disabled")==="true"||!el.closest(KEYS)||el.closest(QUIET))return;
      playTone("key",f.keyToneVolume??0.5);
    };
    const down=e=>{if(e.button===0||e.pointerType!=="mouse")beep(e.target)};
    // A key pressed from the keyboard (Enter or Space on a focused button) clicks with detail 0.
    const click=e=>{if(e.detail===0)beep(e.target)};
    document.addEventListener("pointerdown",down,true);document.addEventListener("click",click,true);
    return()=>{document.removeEventListener("pointerdown",down,true);document.removeEventListener("click",click,true)};
  },[]);
  const changeVolume=dir=>{
    const next=Math.max(0,Math.min(10,volume+dir));
    setVolumes(v=>{const all={...v,[channelId]:next};saveVolumes(all);return all});
    setFlash({text:"Volume "+next});
  };
  // Traffic recording: transmissions heard are saved by the radio and scan/console hooks,
  // and your own are recorded from the mic while you transmit.
  const [trafficSettings,setTrafficSettingsState]=useState(loadTrafficSettings),trafficRef=useRef(trafficSettings);trafficRef.current=trafficSettings;
  const setTrafficSettings=v=>{setTrafficSettingsState(v);saveTrafficSettings(v);prune(v).catch(()=>{})};
  const saveRecording=e=>{if(trafficRef.current.enabled)saveTransmission(e).catch(err=>console.warn("[traffic] save failed",err))};
  const ownRecRef=useRef(null);
  const radioEvents={
    // The server dropped our channel hold or the connection went down mid-transmission.
    onFloorLost:()=>{setPttState(false);if(featuresRef.current.busyTone)tone("error")},
    onTalkEnd:e=>{const f=featuresRef.current;if(f.rogerBeep&&f.rogerTone!=="off"&&e.ms>300&&!mutedRef.current)tone("roger",rogerSteps(f.rogerTone))},
    onRecorded:saveRecording,
    onOwnTalkStart:mic=>{
      if(!trafficRef.current.enabled||ownRecRef.current)return;
      const c=channelsRef.current.find(x=>x.id===channelIdRef.current);
      ownRecRef.current={r:recordTrack(mic?.mediaStreamTrack),at:Date.now(),channelId:c?.id||"",channel:c?.name||"",zone:c?.zoneName||""};
    },
  };
  const {state,error,errorDetail,connectNote,lastUrl,session:radioSession,participants,muted,setMuted,devices,refreshDevices,connect,requestPTT,releasePTT,disconnect,quality,onAir,lastHeard,replay,room:radioRoom}=useRadio(channelId, channels.find(x=>x.id===channelId), speakerId, volumeGain(volume), radioEvents);
  const mutedRef=useRef(muted);mutedRef.current=muted;
  const channelsRef=useRef(channels),channelIdRef=useRef(channelId);channelsRef.current=channels;channelIdRef.current=channelId;
  useEffect(()=>{
    if(state==="transmitting"||!ownRecRef.current)return;
    const x=ownRecRef.current;ownRecRef.current=null;const ms=Date.now()-x.at;
    x.r.stop().then(res=>{if(res)saveRecording({at:x.at,ms,channelId:x.channelId,channel:x.channel,zone:x.zone,name:"You",own:true,blob:res.blob})});
  },[state]);
  const {onlineUsers,incoming,call,callState,error:callError,startCall,accept,decline,endCall}=useDirectCalls(session.member?.id, speakerId, micDeviceId, volumeGain(volume));

  useEffect(()=>{prewarmRadio()},[]);
  useEffect(()=>{
    let active=true,timer=null,tries=0;
    // A failed channel list load (slow Wi-Fi, server hiccup) is retried with backoff and
    // as soon as the network comes back, instead of leaving the radio with no channels.
    const RETRY_MS=[2000,5000,10000,30000];
    const retry=()=>{if(!active)return;clearTimeout(timer);timer=setTimeout(load,RETRY_MS[Math.min(tries++,RETRY_MS.length-1)])};
    const online=()=>{if(active&&timer){clearTimeout(timer);timer=null;load()}};
    window.addEventListener("online",online);
    const load=()=>{timer=null;let t;Promise.race([listRadioChannels(),new Promise((_,reject)=>{t=setTimeout(()=>reject(new Error("Channel list timed out")),20000)})]).finally(()=>clearTimeout(t)).then(list=>{
      if(!active)return;
      if(!list.length){retry();return}
      // A list that arrives after a retry must not retune a radio that is already on.
      if(tries&&stateRef.current!=="ready"&&stateRef.current!=="error"){setChannels(list);return}
      setChannels(list);
      // Start in the ALL zone (or the first zone) on its lowest channel.
      const zoneList=[...new Map(list.filter(c=>c.zoneId).map(c=>[c.zoneId,c])).values()].sort((a,b)=>(a.zoneOrder??999)-(b.zoneOrder??999));
      const startZone=(zoneList.find(c=>/^all$/i.test(String(c.zoneName||"").trim()))||zoneList[0])?.zoneId;
      const inZone=list.filter(c=>c.zoneId===startZone).sort((a,b)=>(a.number??0)-(b.number??0));
      const current=inZone[0]||list.find(x=>x.id===config.defaultChannelId)||list[0];
      if(current){setChannelId(current.id);setChannelName(current.name);setZoneId(current.zoneId||"")}
    }).catch(err=>{console.error("[radio] channel load failed",err);retry()})};
    load();
    return()=>{active=false;clearTimeout(timer);window.removeEventListener("online",online)};
  },[]);

  useEffect(()=>{const current=channels.find(x=>x.id===channelId);if(current)setChannelName(current.name)},[channels,channelId]);

  const connected=state==="listening"||state==="transmitting";
  const stateRef=useRef(state);stateRef.current=state;
  // Power turns the radio on, or off from any other state, including cancelling a
  // connect still in progress or a reconnect.
  const togglePower=()=>{if(state==="ready"||state==="error")connect().catch(()=>{});else{setPttState(false);disconnect().catch(()=>{})}};
  // Member status: shared as a LiveKit attribute and re-applied on every connect.
  const [myStatus,setMyStatus]=useState(()=>readPref(STATUS_KEY)||""),[statusShared,setStatusShared]=useState(false);
  const chooseStatus=s=>{setMyStatus(s);writePref(STATUS_KEY,s);setFlash({text:s?"Status: "+s:"Status cleared"})};
  useEffect(()=>{
    if(!connected||!radioRoom){setStatusShared(false);return}
    let alive=true;
    shareStatus(radioRoom,myStatus).then(ok=>{if(alive)setStatusShared(ok)}).catch(()=>{if(alive)setStatusShared(false)});
    return()=>{alive=false};
  },[connected,radioRoom,myStatus]);
  // Scan list (saved) and scan on/off. The default list is the current zone's channels.
  const [scanCfg,setScanCfgState]=useState(loadScan),[scanOn,setScanOn]=useState(false);
  const [consoleCfgState,setConsoleCfgState]=useState(loadConsole),[consoleOn,setConsoleOn]=useState(false);
  const consoleCfg=consoleCfgState||{list:channels.filter(c=>c.zoneId===zoneId).map(c=>c.id).slice(0,SCAN_MAX),muted:[]};
  const setConsoleCfg=v=>{setConsoleCfgState(v);saveConsole(v)};
  const consoleChannels=useMemo(()=>consoleCfg.list.filter(id=>id!==channelId).map(id=>channels.find(c=>c.id===id)).filter(Boolean),[consoleCfg.list.join(","),channelId,channels]);
  const scan=scanCfg||{list:channels.filter(c=>c.zoneId===zoneId).map(c=>c.id).slice(0,SCAN_MAX),priority:""};
  const setScanCfg=v=>{setScanCfgState(v);saveScan(v)};
  const scanChannels=useMemo(()=>scan.list.filter(id=>id!==channelId).map(id=>channels.find(c=>c.id===id)).filter(Boolean),[scan.list.join(","),channelId,channels]);
  const levels=useMemo(()=>Object.fromEntries(consoleChannels.map(c=>[c.id,volumeGain(volumes[c.id]??DEFAULT_VOLUME)])),[consoleChannels,volumes]);
  const {active:scanActive,status:scanStatus,errors:scanErrors,activity,nuisanceDelete}=useScan({
    enabled:(scanOn||consoleOn)&&(connected||state==="reconnecting"),channels:consoleOn?consoleChannels:scanChannels,mode:consoleOn?"monitor":"scan",
    levels,mutedIds:consoleCfg.muted||[],onRecorded:trafficSettings.enabled?saveRecording:null,priorityId:scan.priority,volume:volumeGain(volume),muted,outputDeviceId:speakerId,suppress:!consoleOn&&(!!onAir||ptt),
  });
  // Scan and the monitor console share the listening rooms, so only one runs at a time.
  const toggleScan=()=>{setConsoleOn(false);setScanOn(v=>!v);setFlash({text:scanOn?"Scan off":"Scan on"})};
  const toggleConsole=()=>{setScanOn(false);setConsoleOn(v=>!v);setFlash({text:consoleOn?"Console off":"Console monitoring"})};
  const setLevel=(id,v)=>{const next=Math.max(0,Math.min(10,v));setVolumes(all=>{const n={...all,[id]:next};saveVolumes(n);return n})};
  // Who was last heard on each channel, for the console tiles.
  const [lastTalk,setLastTalk]=useState({});
  useEffect(()=>{const now=Date.now(),add={};for(const [id,name] of Object.entries(activity||{}))if(name)add[id]={name,at:now};if(Object.keys(add).length)setLastTalk(l=>({...l,...add}))},[activity]);
  useEffect(()=>{if(onAir?.name)setLastTalk(l=>({...l,[channelId]:{name:onAir.name,at:Date.now()}}))},[onAir?.identity]);
  const nuisance=()=>{const c=nuisanceDelete();if(c)setFlash({text:"Deleted "+c.name+" from scan"})};
  const currentChannel=channels.find(x=>x.id===channelId);
  const currentChannelRef=useRef(null);currentChannelRef.current=currentChannel?{...currentChannel,zoneName:zones.find(z=>z.id===currentChannel.zoneId)?.name||currentChannel.zoneName}:null;
  const selectZone=async next=>{
    if(next===zoneId)return;
    if(!next)return;
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
    const c=channels.find(x=>x.id===channelId);
    const f=featuresRef.current;
    if(c&&f.announce)announce(announceText(c),{voice:f.announceVoice,rate:f.announceRate,pitch:f.announcePitch});
    return()=>clearTimeout(id);
  },[tuneSeq]);
  const chooseZone=e=>selectZone(e.target.value);
  const chooseChannel=e=>selectChannel(e.target.value);
  // PTT can be keyed from the palm mic, the keyboard and hardware buttons at once, so
  // track it in a ref too: a second "down" from another source must not re-key.
  const pttRef=useRef(false);
  const setPttState=v=>{pttRef.current=v;setPtt(v)};
  const offPressRef=useRef(0);
  const down=async()=>{
    if(!connected&&!pttRef.current&&!learnFor){
      // Say why PTT did nothing (at most every 1.5 s, so a held key doesn't repeat it).
      if(Date.now()-offPressRef.current>1500){
        offPressRef.current=Date.now();
        if(featuresRef.current.busyTone)tone("error");
        setFlash({text:state==="reconnecting"?"Reconnecting…":state==="connecting"?"Connecting…":"Radio off"});
      }
      return;
    }
    if(pttRef.current||learnFor)return;
    setPttState(true);
    let result="error";
    try{result=await requestPTT(micDeviceId)}catch{}
    if(result==="granted"){if(featuresRef.current.permitTone)tone("permit");return}
    if(result==="pending")return;
    if(result==="stale")return;
    setPttState(false);
    if(featuresRef.current.busyTone)tone(result==="busy"?"busy":"error");
  };
  // Time-out timer: warn 5 s before the limit, then key off like a real radio.
  useEffect(()=>{
    const limit=features.tot;if(state!=="transmitting"||!limit)return;
    const warn=setTimeout(()=>tone("tot"),Math.max(0,limit-5)*1000);
    const stop=setTimeout(()=>{upRef.current();tone("timeout");setFlash({text:"Time-out timer"})},limit*1000);
    return()=>{clearTimeout(warn);clearTimeout(stop)};
  },[state,features.tot]);
  const up=async()=>{if(!pttRef.current)return;setPttState(false);await releasePTT()};

  // Button mapping: every radio action can be bound to keys and hardware buttons.
  const [hwCaps,setHwCaps]=useState(null),[keymap,setKeymap]=useState(null),[learnFor,setLearnFor]=useState(""),[mapNotice,setMapNotice]=useState("");
  const keymapRef=useRef(keymap),learnForRef=useRef(learnFor);keymapRef.current=keymap;learnForRef.current=learnFor;
  const updateKeymap=m=>{setKeymap(m);saveKeymap(m);setHardwareBindings(m)};
  // Starting to learn takes focus off the Add button, so the key being learned (Space,
  // Enter) can't press it again and restart learning.
  const learn=id=>{if(id)document.activeElement?.blur?.();setLearnFor(id);setMapNotice("");setLearning(!!id)};
  const addLearned=input=>{
    const action=learnForRef.current,map=keymapRef.current||[];
    if(!action)return;
    // The page and the Windows hook can both report the same press: take the first only.
    learnForRef.current="";setLearnFor("");
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
    else if(action==="power")togglePower();
    else if(action==="mute")setMuted(!muted);
    else if(action==="volume_up"||action==="volume_down")changeVolume(action==="volume_up"?1:-1);
    else if(action==="scan")toggleScan();
    else if(action==="mini")toggleMini();
    else if(action.startsWith("status_")){const st=STATUSES[Number(action.slice(7))-1];if(st)chooseStatus(st===myStatus?"":st)}
    else if(action==="console"){if(connected)toggleConsole()}
    else if(action==="nuisance")nuisance();
    else if(action==="answer"){if(incoming)accept()}
    else if(action==="decline"){if(incoming)decline()}
    else if(action==="end_call"){if(call)endCall()}
    else{if(action==="home"||tab!=="radio")setTab("radio");setFaceCommand({action})}
  };
  const downRef=useRef(down),upRef=useRef(up),runRef=useRef(runAction);downRef.current=down;upRef.current=up;runRef.current=runAction;
  // A key the page and the Windows hook both see (hand-mic and media keys while the app is
  // in front) arrives twice; act on the first report only. Either source alone (a blocked
  // hook, or the app in the background) still works.
  const lastFireRef=useRef(new Map());
  const handleAction=({action,pressed,global},source="page")=>{
    const id=action+(pressed?":down":":up"),now=Date.now(),last=lastFireRef.current.get(id);
    if(last&&last.source!==source&&now-last.at<300)return;
    lastFireRef.current.set(id,{source,at:now});
    if(action==="ptt"){pressed?downRef.current():upRef.current();return}
    if(!pressed||learnForRef.current||(!global&&!document.hasFocus()))return;
    runRef.current(action);
  };
  const handleRef=useRef(handleAction);handleRef.current=handleAction;
  // Bluetooth speaker-mics made for Zello (Abbree / KST_vHMIC010 and similar) send PTT as
  // Fast Forward on press and Rewind on release. Windows hands those to the app's media
  // controls (media_buttons.rs, arriving as a hook action); other systems give them to
  // the page as media keys or media-session seek actions; the Android app passes them on
  // as an "rn-mic-ptt" event (src-tauri/android/MainActivity.kt). Always PTT, nothing to learn.
  const micDownRef=useRef(false);
  const micPtt=pressed=>{if(micDownRef.current===pressed||(pressed&&learnForRef.current))return;micDownRef.current=pressed;handleRef.current({action:"ptt",pressed,global:true},"mic")};
  const micPttRef=useRef(micPtt);micPttRef.current=micPtt;
  useEffect(()=>{
    const ms=navigator.mediaSession;if(!ms?.setActionHandler)return;
    const set=(a,f)=>{try{ms.setActionHandler(a,f)}catch{}};
    set("seekforward",()=>micPttRef.current(true));set("seekbackward",()=>micPttRef.current(false));
    return()=>{set("seekforward",null);set("seekbackward",null)};
  },[]);
  useEffect(()=>{
    const onMic=e=>micPttRef.current(!!e.detail);
    window.addEventListener("rn-mic-ptt",onMic);return()=>window.removeEventListener("rn-mic-ptt",onMic);
  },[]);
  // A paired Bluetooth button reconnects at startup, whichever tab is open.
  const [bleStatus,setBleStatus]=useState(null);
  useEffect(()=>{const off=listenBle(setBleStatus);const saved=loadBleDevice();if(saved)bleConnect(saved);return off},[]);
  useEffect(()=>{
    let alive=true;
    hwCapabilities().then(caps=>{if(!alive)return;const map=loadKeymap(caps.global_keys);setHwCaps(caps);setKeymap(map);setHardwareBindings(map)});
    const off=listenHardware({
      onAction:a=>handleRef.current(a,"hook"),
      onLearned:input=>addLearnedRef.current(input),
      onLearnCancel:()=>setLearnFor(""),
    });
    return()=>{alive=false;off()};
  },[]);
  const addLearnedRef=useRef(addLearned);addLearnedRef.current=addLearned;

  useEffect(()=>{
    if(!keymap)return;
    // The page reads every mapped key itself while the app is in front: in-window keys,
    // and keys learned by Windows key code. Keys nobody types with (F13–F24, media and
    // volume keys) are also reported by the Windows hook, which handleAction de-duplicates;
    // the page still gets them when antivirus blocks the hook. The hook alone handles
    // "Anywhere" keys while another window is in front.
    const page=keymap.filter(b=>b.kind==="webkey"||b.kind==="key");
    const matches=e=>{const vk=keyVk(e);return page.filter(b=>b.kind==="webkey"?b.code===e.code:Number(b.code)===vk)};
    const typing=e=>/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||"")||!!e.target?.isContentEditable;
    const held=new Map();// key → actions its press fired, so the release reaches the same ones
    const keyDown=e=>{
      if(e.code in MIC_PTT){e.preventDefault();if(!e.repeat)micPttRef.current(MIC_PTT[e.code]);return}
      if(learnFor){
        // Keep Space/Enter from also pressing the focused button while a button is learned.
        e.preventDefault();
        if(e.code==="Escape"){learn("");return}
        // On Windows a key is learned by its virtual-key code, so it can later be set to
        // "Anywhere" for the hook. The page learns it too rather than waiting on the hook:
        // antivirus can block the keyboard hook while letting the mouse hook through, and
        // then only mouse buttons could ever be learned. The hook still learns mouse and
        // media buttons; whichever reports first wins (see addLearned).
        if(hwCaps?.global_keys){
          if(!learnForRef.current)return;
          addLearned({kind:"key",code:String(keyVk(e)),label:keyLabel(e)});setLearning(false);return;
        }
        addLearned({kind:"webkey",code:e.code,label:keyLabel(e)});return;
      }
      if(typing(e))return;
      const hits=matches(e);if(!hits.length)return;
      e.preventDefault();if(e.repeat||held.has(e.code))return;
      held.set(e.code,hits);
      hits.forEach(b=>handleAction({action:b.action,pressed:true,global:true}));
    };
    const keyUp=e=>{
      if(e.code in MIC_PTT){e.preventDefault();return}
      if(learnFor){e.preventDefault();return}
      const hits=held.get(e.code);if(!hits)return;
      held.delete(e.code);e.preventDefault();
      hits.forEach(b=>handleAction({action:b.action,pressed:false,global:true}));
    };
    // A key let go after switching to another window never sends its key-up here, so
    // release everything held (otherwise PTT would stay keyed).
    const releaseAll=()=>{held.forEach(hits=>hits.forEach(b=>handleAction({action:b.action,pressed:false,global:true})));held.clear()};
    window.addEventListener("keydown",keyDown);window.addEventListener("keyup",keyUp);window.addEventListener("blur",releaseAll);
    return()=>{releaseAll();window.removeEventListener("keydown",keyDown);window.removeEventListener("keyup",keyUp);window.removeEventListener("blur",releaseAll)}
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
  const speakerMic=devices.some(d=>d.kind==="audioinput"&&HAND_MIC.test(d.label||""));
  useEffect(()=>{setMicButtons(speakerMic)},[speakerMic]);
  const pttBindings=(keymap||[]).filter(b=>b.action==="ptt"),pttName=pttBindings.map(b=>b.label||b.code).join(" / ");
  const keymapProps={keymap:keymap||[],caps:hwCaps,learnFor,notice:mapNotice,onLearn:learn,onRemove:i=>updateKeymap(keymap.filter((_,k)=>k!==i)),onToggleGlobal:i=>updateKeymap(keymap.map((b,k)=>k===i?{...b,global:!b.global}:b)),onReset:()=>{updateKeymap(defaultBindings(!!hwCaps?.global_keys));setMapNotice("Button mapping reset to defaults.")}};

  // Mini radio: the same window shrunk to a small always-on-top radio.
  const [mini,setMini]=useState(false),miniSeen=useRef(false);
  const toggleMini=()=>setMini(m=>!m);
  useEffect(()=>{if(!miniSeen.current&&!mini)return;miniSeen.current=true;setMiniWindow(mini)},[mini]);
  // Leaving the radio screen (sign out, expired sign-in) puts the window back to full size.
  const miniRef=useRef(mini);miniRef.current=mini;
  useEffect(()=>()=>{if(miniRef.current)setMiniWindow(false)},[]);
  // Tray icon: tooltip shows the channel; its menu toggles the mini radio and mute.
  const [hasTray,setHasTray]=useState(false);
  useEffect(()=>{
    const where=currentChannel?`${currentChannel.zoneName?currentChannel.zoneName+" ":""}CH ${currentChannel.number??""} ${currentChannel.name}`:channelName;
    setTray(`Repeater Nation Radio · ${where}${connected?"":state==="reconnecting"?" (reconnecting)":" (off)"}${muted?" (muted)":""}`,!!features.closeToTray).then(setHasTray);
  },[channelName,currentChannel?.id,connected,state==="reconnecting",muted,features.closeToTray]);
  const endCallRef=useRef(endCall);endCallRef.current=endCall;
  // "quit" comes from the tray menu or the window's close button; the app exits right after.
  useEffect(()=>listenTray(action=>{if(action==="mini")setMini(m=>!m);else if(action==="mute")runRef.current("mute");else if(action==="quit"){window.dispatchEvent(new Event("rn-app-exiting"));endCallRef.current().catch(()=>{})}}),[]);
  // Notifications while the radio is behind other windows or hidden in the tray.
  useEffect(()=>{
    if(!incoming||!featuresRef.current.notifyCalls||!appInBackground())return;
    notify("Incoming radio call",(incoming.caller_display_name||incoming.caller_callsign||"A member")+" is calling you");
  },[incoming?.id]);
  const talkNotified=useRef(new Map());
  const notifyTalk=(where,who)=>{
    if(!who||!featuresRef.current.notifyTalk||!appInBackground())return;
    const key=where+"|"+who,now=Date.now();
    if(now-(talkNotified.current.get(key)||0)<60000)return;
    talkNotified.current.set(key,now);notify(where,who+" is talking");
  };
  useEffect(()=>{notifyTalk(channelName,onAir?.name)},[onAir?.identity]);
  useEffect(()=>{for(const [id,who] of Object.entries(activity||{})){const c=channels.find(x=>x.id===id);if(c)notifyTalk((consoleOn?"":"Scan · ")+c.name,who)}},[activity]);

  const logout=async(notice)=>{
    try{await disconnect()}catch{}
    try{await endCall()}catch{}
    await clearSession();onSignOut(typeof notice==="string"?notice:"");
  };
  const logoutRef=useRef(logout);logoutRef.current=logout;
  useEffect(()=>{
    const expired=()=>logoutRef.current("Your Repeater Nation sign-in expired. Sign in again.");
    window.addEventListener("rn-auth-expired",expired);
    return()=>window.removeEventListener("rn-auth-expired",expired);
  },[]);
  const displayName=radioSession?.displayName||session.member?.full_name||session.member?.email||"Member";
  const callsign=radioSession?.callsign||session.member?.callsign||"";

  if(IS_PHONE)return <PhoneApp
    zones={zones} zoneId={zoneId} visibleChannels={visibleChannels} channelId={channelId} channelName={channelName}
    state={state} connected={connected} error={error} connectNote={connectNote} ptt={ptt} muted={muted} onAir={onAir} participants={participants}
    scanning={scanOn} scanActive={scanActive} flash={flash} volume={volume} lastHeard={lastHeard} onReplay={replay}
    onPower={togglePower} onZone={selectZone} onChannel={selectChannel} onDown={down} onUp={up} onMute={()=>setMuted(!muted)} onVolume={changeVolume} onScan={connected?toggleScan:null}
    incoming={incoming} call={call} callState={callState} callError={callError} onlineUsers={onlineUsers} onCall={startCall} onAnswer={accept} onDecline={decline} onEndCall={endCall}
    displayName={displayName} callsign={callsign} onSignOut={logout}
    myStatus={myStatus} onStatus={chooseStatus}
    settingsPanel={<>
      <div className="setting"><span>Microphone</span><div className="prog-fields"><label><select value={micDeviceId} onFocus={refreshDevices} onChange={e=>setMicDeviceId(e.target.value)}><option value="">Phone default</option>{devices.filter(d=>d.kind==="audioinput").map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||"Microphone"}</option>)}</select></label></div></div>
      <div className="setting"><span>Scan list</span><ScanList channels={channels} zones={zones} scan={scan} setScan={setScanCfg} status={scanStatus} errors={scanErrors}/></div>
      <div className="setting"><span>Radio features</span><RadioFeatures features={features} setFeature={setFeature} hasTray={false} onTest={testFeature}/></div>
      <div className="setting ble-setting"><span>Bluetooth PTT mic</span><BluetoothPtt status={bleStatus} setStatus={setBleStatus}/></div>
      <div className="setting keymap-setting"><span>Buttons and PTT</span><KeyMap {...keymapProps}/></div>
      {state==="error"&&errorDetail&&<div className="setting"><span>Last connection error</span><code className="setting-error">{errorDetail}</code></div>}
    </>}
  />;
  if(mini)return <MiniRadio
    channelName={channelName} channelNumber={currentChannel?.number} zoneName={currentChannel?.zoneName||zones.find(z=>z.id===zoneId)?.name}
    state={state} connected={connected} error={error} connectNote={connectNote} ptt={ptt} muted={muted} quality={quality} onAir={onAir} scanning={scanOn} scanActive={scanActive} flash={flash} volume={volume} incoming={incoming}
    onDown={down} onUp={up} onChannel={dir=>runAction(dir>0?"channel_up":"channel_down")} onMute={()=>setMuted(!muted)} onVolume={changeVolume}
    onPower={()=>runAction("power")} onExpand={()=>setMini(false)} onAnswer={accept} onDecline={decline}
  />;
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark small"><Radio size={20}/></div><div><strong>Repeater Nation</strong><span>RADIO</span></div></div>
      <div className="topbar-right"><span aria-label={"Build version "+String(__APP_VERSION__)} style={{fontSize:12,fontWeight:700,letterSpacing:".06em",opacity:.8,padding:"5px 9px",border:"1px solid rgba(255,255,255,.18)",borderRadius:6,background:"rgba(255,255,255,.06)"}}>BUILD v{String(__APP_VERSION__)}</span><button type="button" className="mini-open" onClick={toggleMini} title="Mini radio (always on top)"><Minimize2 size={15}/> Mini</button><div className="connection"><i className={connected?"online":"offline"}/>{connected?"Connected":state==="connecting"?"Connecting…":state==="reconnecting"?"Reconnecting…":"Ready"}<ChevronDown size={14}/></div></div>
    </header>
    <div className="body">
      <aside className="sidebar">{[["radio","Radio",Radio],["console","Console",LayoutGrid],["log","Log",History],["members","Who’s On",Users],["calls","Calls",Phone],["settings","Settings",Settings]].map(([id,label,Icon])=><button key={id} className={tab===id?"nav active":"nav"} onClick={()=>setTab(id)}><Icon size={19}/>{label}</button>)}</aside>
      <main className="content">
        {tab==="radio"&&<>
          <section className="hero apx-hero"><div><div className="eyebrow">{channelName.toUpperCase()}</div><h2>Repeater Nation Radio</h2><p className="muted">{displayName}{callsign?" · "+callsign:""}</p></div></section>
          <section className={"apx-stage face-"+face}>
            <RadioFace face={face} onPttDown={down} onPttUp={up} myStatus={myStatus} onStatus={chooseStatus}
              channelName={channelName} channelNumber={currentChannel?.number} zoneName={currentChannel?.zoneName||zones.find(z=>z.id===zoneId)?.name}
              zones={zones} zoneId={zoneId} visibleChannels={visibleChannels} channelId={channelId}
              state={state} connected={connected} ptt={ptt} muted={muted} error={error} callsign={radioSession?.callsign||callsign} displayName={displayName} participants={participants}
              incoming={incoming} call={call} callState={callState}
              onPower={togglePower} connectNote={connectNote} onMute={()=>setMuted(!muted)} onChannel={selectChannel} onZone={selectZone} onTab={setTab}
              onAnswer={accept} onDecline={decline} onEndCall={endCall} command={faceCommand}
              quality={quality} onAir={onAir} volume={volume} onVolume={changeVolume} lastHeard={lastHeard} onReplay={replay} flash={flash}
              scanning={scanOn} scanActive={scanActive} onScan={connected?toggleScan:null} onNuisance={nuisance}
            />
            <div className="apx-side">
              <PalmMic ptt={ptt} connected={connected} onDown={down} onUp={up} pttName={pttName}/>
            </div>
          </section>
          <div className="grid radio-calls"><section className="panel"><div className="panel-title"><Phone size={17}/> Calls</div>{incoming?<div className="call-card"><strong>Incoming call</strong><span>{incoming.caller_display_name||incoming.caller_callsign||"Member"}</span><div><button className="primary" onClick={accept}><PhoneCall size={16}/> Answer</button><button className="danger" onClick={decline}><PhoneOff size={16}/> Decline</button></div></div>:call?<div className="call-card"><strong>{callState==="calling"?"Calling…":callState==="reconnecting"?"Call reconnecting…":"Call connected"}</strong><span>{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</span><button className="danger" onClick={endCall}><PhoneOff size={16}/> End call</button></div>:<div className="empty">Open Calls to see available members.</div>}</section></div>
          <LastHeard items={lastHeard} onReplay={replay}/>
        </>}
        {tab==="console"&&<><ConsoleView channels={channels} zones={zones} cfg={consoleCfg} setCfg={setConsoleCfg} on={consoleOn} onToggle={toggleConsole} onSelect={selectChannel} connected={connected}
          selectedId={channelId} activity={activity||{}} mainTalker={onAir?.name||""} lastTalk={lastTalk} status={scanStatus} errors={scanErrors} volumes={volumes} onLevel={setLevel}
          onMuteSelected={()=>setMuted(!muted)} muted={muted} state={state} ptt={ptt} onDown={down} onUp={up} pttName={pttName}/>
          <div className="grid console-extras"><section className="panel console-who"><div className="panel-title"><Users size={17}/> Who’s On — {channelName}</div>{participants.length?participants.map(p=><MemberName key={p.identity} participant={p} talking={onAir?.identity===p.identity}/>):<div className="empty">{connected?"No other members are currently on this channel.":"Connect to see who’s on."}</div>}</section><section className="panel console-status"><div className="panel-title"><Flag size={17}/> My status</div><StatusButtons status={myStatus} onStatus={chooseStatus} shared={statusShared} connected={connected}/></section></div>
        </>}
        {tab==="log"&&<TrafficLog channels={channels} settings={trafficSettings} setSettings={setTrafficSettings} speakerId={speakerId} volume={volumeGain(volume)}/>}
        {tab==="members"&&<section className="panel full"><div className="panel-title"><Users/> Who’s On — {channelName}</div>{participants.length?participants.map(p=><MemberName key={p.identity} participant={p} talking={onAir?.identity===p.identity}/>):<div className="empty">{connected?"No other members are currently on this channel.":"Connect to see who’s on."}</div>}</section>}
        {tab==="calls"&&<section className="panel full"><div className="panel-title"><Phone/> Calls</div>{incoming&&<div className="call-card"><strong>Incoming call</strong><span>{incoming.caller_display_name||incoming.caller_callsign||"Member"}</span><div><button className="primary" onClick={accept}><PhoneCall size={16}/> Answer</button><button className="danger" onClick={decline}><PhoneOff size={16}/> Decline</button></div></div>}{call&&!incoming&&<div className="call-card"><strong>{callState==="calling"?"Calling…":callState==="reconnecting"?"Call reconnecting…":"Call connected"}</strong><span>{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</span><button className="danger" onClick={endCall}><PhoneOff size={16}/> End call</button></div>}<div className="panel-title"><Users size={17}/> Available Members</div>{onlineUsers.length?onlineUsers.map(u=><div className="member" key={u.userId}><div><strong>{u.callsign||u.displayName}</strong><span>{u.channelId?"On radio":"Available"}</span></div><button className="primary" onClick={()=>startCall(u)} disabled={callState!=="idle"}><PhoneCall size={15}/> Call</button></div>):<div className="empty">No other radio members are currently online.</div>}{callError&&<div className="error">{callError}</div>}</section>}
        {tab==="settings"&&<section className="panel full"><div className="panel-title"><Settings/> Radio Settings</div><div className="settings-group label">PROGRAMMING</div><div className="setting keymap-setting"><span>Radio</span><div className="face-picker">{FACES.map(x=><label key={x.id} className={face===x.id?"on":""}><input type="radio" name="face" value={x.id} checked={face===x.id} onChange={()=>chooseFace(x.id)}/><strong>{x.label}</strong><small>{x.note}</small></label>)}</div></div><div className="setting keymap-setting"><span>Zone and channel</span><div className="prog-fields"><label>Zone<select value={zoneId} onChange={chooseZone} disabled={!zones.length}>{zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select></label><label>Channel<select value={channelId} onChange={chooseChannel} disabled={!visibleChannels.length}>{visibleChannels.map(c=><option key={c.id} value={c.id}>{c.name} · CH {c.number}</option>)}</select></label><small>{connected?participants.length+" on channel":"Not connected"}</small></div></div><div className="setting keymap-setting"><span>Microphone and speaker</span><div className="prog-fields"><label>Microphone<select value={micDeviceId} onFocus={refreshDevices} onChange={e=>setMicDeviceId(e.target.value)}><option value="">System default</option>{devices.filter(d=>d.kind==="audioinput").map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||"Microphone"}</option>)}</select></label><label>Speaker<select value={speakerId} onFocus={refreshDevices} onChange={e=>setSpeakerId(e.target.value)}><option value="">System default</option>{devices.filter(d=>d.kind==="audiooutput"&&d.deviceId!=="default").map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||"Speaker"}</option>)}</select></label><small>{muted?"Speaker muted":"Speaker on"}</small></div></div><div className="setting keymap-setting"><span>Scan list</span><ScanList channels={channels} zones={zones} scan={scan} setScan={setScanCfg} status={scanStatus} errors={scanErrors}/></div><div className="setting keymap-setting"><span>Radio features</span><RadioFeatures features={features} setFeature={setFeature} hasTray={hasTray} onTest={testFeature}/></div><div className="setting keymap-setting"><span>Buttons and PTT</span><KeyMap {...keymapProps}/></div>{inDesktopApp()&&<div className="setting ble-setting"><span>Bluetooth button</span><BluetoothPtt status={bleStatus} setStatus={setBleStatus}/></div>}<div className="settings-group label">ACCOUNT AND APP</div><div className="setting"><span>Account</span><strong>{displayName}{callsign?" · "+callsign:""}</strong></div><div className="setting"><span>LiveKit server</span><code>{radioSession?.liveKitUrl||lastUrl||config.livekitUrl}</code></div>{state==="error"&&errorDetail&&<div className="setting"><span>Last connection error</span><code className="setting-error">{errorDetail}</code></div>}<UpdateStatus/><button className="danger" onClick={logout}><RefreshCw size={16}/> Sign out / switch account</button></section>}
      </main>
    </div>
  </div>
}

export default function App(){
  const [session,setSession]=useState(null),[signOutNote,setSignOutNote]=useState("");
  const [authChecking,setAuthChecking]=useState(true),[authOffline,setAuthOffline]=useState(false);
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
      if(restored){setSession(restored);setAuthChecking(false);return}
      // Use the sign-in saved on this device. If Repeater Nation can't be reached yet
      // (no internet at startup), keep the saved sign-in and try again instead of
      // showing the login screen.
      for(let attempt=0;!disposed;attempt++){
        const saved=await restoreSession();
        if(disposed)return;
        if(saved?.member){setSession(saved);break}
        if(!saved?.offline)break;
        setAuthOffline(true);
        await new Promise(r=>setTimeout(r,Math.min(15000,2000*(attempt+1))));
      }
      if(!disposed){setAuthOffline(false);setAuthChecking(false)}
    })();
    return()=>{
      disposed=true;
      window.removeEventListener("rn-radio-session",handler);
      if(unlisten) unlisten();
    };
  },[]);
  if(authChecking)return <main className="login-shell"><div className="brand-mark"><Radio size={30}/></div><h1>Repeater Nation Radio</h1><p className="muted">{authOffline?"Can't reach Repeater Nation yet. Trying again…":"Checking your sign-in…"}</p>{authOffline&&<button type="button" className="primary" onClick={()=>{setAuthOffline(false);setAuthChecking(false)}}>Sign in again</button>}</main>;
  return session?<RadioApp session={session} onSignOut={note=>{setSignOutNote(note||"");setSession(null)}}/>:<Login notice={signOutNote}/>;
}