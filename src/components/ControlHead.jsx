import {useEffect,useRef,useState} from "react";
import {Power,Sun,SunDim,Volume2,VolumeX,Megaphone,Hand,Lightbulb,Siren,Zap,Waves,Activity,Home,Mic,Signal,PhoneIncoming,Phone,Users,ChevronUp,ChevronDown,ChevronLeft,ChevronRight,Menu} from "lucide-react";

// APX O7-style control head. Every live control maps to an existing radio action;
// the vehicle-only keys (siren, lights, horn, PA, emergency) are drawn for looks and stay inert.

const KEYPAD=[["1",". ? !"],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],["7","PQRS"],["8","TUV"],["9","WXYZ"],["*",""],["0","+"],["#",""]];

// Scrolling a knob turns it one detent per notch. The listener is non-passive so the
// wheel does not also scroll the page, and trackpad deltas are summed into detents.
function Knob({className="",angle=0,label,onClick,onStep,children,title}){
  const ref=useRef(null),stepRef=useRef(onStep),accRef=useRef(0);
  stepRef.current=onStep;
  useEffect(()=>{
    const el=ref.current;if(!el)return;
    const onWheel=e=>{
      if(!stepRef.current)return;
      e.preventDefault();
      accRef.current+=e.deltaMode===1?e.deltaY*40:e.deltaY;
      if(Math.abs(accRef.current)<60)return;
      const dir=accRef.current>0?1:-1;accRef.current=0;
      stepRef.current(dir);
    };
    el.addEventListener("wheel",onWheel,{passive:false});
    return()=>el.removeEventListener("wheel",onWheel);
  },[]);
  return <button type="button" ref={ref} className={"apx-knob "+className} onClick={onClick} title={title} aria-label={title}>
    <span className="apx-knob-cap" style={{transform:`rotate(${angle}deg)`}}><i/></span>
    {children}
    {label&&<span className="apx-knob-label">{label}</span>}
  </button>
}

function Clock(){
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const id=setInterval(()=>setNow(new Date()),15000);return()=>clearInterval(id)},[]);
  return <span>{now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
}

export function ControlHead({
  channelName,channelNumber,zoneName,zones,zoneId,visibleChannels,channelId,
  state,connected,ptt,muted,error,callsign,participants,
  incoming,call,callState,
  onPower,onMute,onChannel,onZone,onTab,onAnswer,onDecline,onEndCall,command,
}){
  const [view,setView]=useState("home");
  const [entry,setEntry]=useState("");
  const [brightness,setBrightness]=useState(3);
  const [notice,setNotice]=useState("");

  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(""),2200);return()=>clearTimeout(id)},[notice]);
  useEffect(()=>setNotice(""),[state]);

  const rawChannelIndex=visibleChannels.findIndex(c=>c.id===channelId);
  const rawZoneIndex=zones.findIndex(z=>z.id===zoneId);
  const channelIndex=Math.max(0,rawChannelIndex),zoneIndex=Math.max(0,rawZoneIndex);
  const stepChannel=dir=>{
    if(!visibleChannels.length)return;
    // From "no selection" (-1), +1 lands on the first entry and -1 on the last.
    const from=rawChannelIndex<0&&dir<0?0:rawChannelIndex;
    const next=visibleChannels[(from+dir+visibleChannels.length)%visibleChannels.length];
    if(next)onChannel(next.id);
  };
  const stepZone=dir=>{
    if(!zones.length)return;
    const from=rawZoneIndex<0&&dir<0?0:rawZoneIndex;
    onZone(zones[(from+dir+zones.length)%zones.length].id);
  };

  const pressKey=k=>{
    if(k==="*"){setEntry("");return}
    if(k==="#"){
      if(!entry)return;
      const match=visibleChannels.find(c=>String(c.number)===String(parseInt(entry,10)));
      if(match){onChannel(match.id);setView("home")}
      else setNotice("No CH "+entry+" in zone");
      setEntry("");return;
    }
    setEntry(v=>(v+k).slice(0,3));setView("home");
  };
  const goHome=()=>{setView("home");setEntry("");onTab("radio")};
  const oneTouch=i=>{const c=visibleChannels[i];if(c)onChannel(c.id);else setNotice("P"+(i+1)+" not programmed")};

  // Context-sensitive softkey labels, like the real radio's menu row.
  const top=[
    {label:connected?"Off":"Connect",act:onPower,disabled:state==="connecting"},
    {label:muted?"Unmute":"Mute",act:onMute},
    {label:view==="who"?"Back":"Who's On",act:()=>setView(v=>v==="who"?"home":"who")},
    {label:"Calls",act:()=>onTab("calls")},
    {label:"Setup",act:()=>onTab("settings")},
  ];
  const bottom=incoming?[
    {label:"Answer",act:onAnswer,tone:"go"},
    {label:"Decline",act:onDecline,tone:"stop"},
    {label:"",act:null},{label:"",act:null},
    {label:"Contacts",act:()=>onTab("calls")},
  ]:call?[
    {label:"End Call",act:onEndCall,tone:"stop"},
    {label:"",act:null},{label:"",act:null},{label:"",act:null},
    {label:"Contacts",act:()=>onTab("calls")},
  ]:[
    {label:"Chan −",act:()=>stepChannel(-1)},
    {label:"Chan +",act:()=>stepChannel(1)},
    {label:"Zone",act:()=>stepZone(1)},
    {label:"Contacts",act:()=>onTab("calls")},
    {label:"Home",act:goHome},
  ];

  // Mapped hardware buttons for face-only controls arrive as one-shot commands.
  useEffect(()=>{
    if(!command||command.done)return;
    command.done=true;
    const a=command.action;
    if(a==="home")goHome();
    else if(a==="who")setView(v=>v==="who"?"home":"who");
    else if(a==="bright_up")setBrightness(b=>Math.min(3,b+1));
    else if(a==="bright_down")setBrightness(b=>Math.max(0,b-1));
    else if(/^soft_[tb][1-5]$/.test(a)){const k=(a[5]==="t"?top:bottom)[Number(a[6])-1];if(k?.act&&!k.disabled)k.act()}
    else if(a.startsWith("key_"))pressKey(a.slice(4));
  },[command]);

  let banner=null;
  if(ptt)banner={tone:"tx",title:"Transmitting",sub:callsign||""};
  else if(incoming)banner={tone:"rx",title:"Call Received",sub:incoming.caller_display_name||incoming.caller_callsign||"Member",icon:PhoneIncoming};
  else if(call)banner={tone:"call",title:callState==="calling"?"Calling…":"Call Connected",sub:call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member",icon:Phone};
  else if(error)banner={tone:"warn",title:error};
  else if(notice)banner={tone:"warn",title:notice};
  else if(state==="connecting")banner={tone:"idle",title:"Connecting…"};
  else if(connected)banner={tone:"listen",title:"Listening",sub:participants.length+" on channel"};
  else banner={tone:"idle",title:"Radio Off",sub:"Press Connect or power"};

  const bars=connected?4:state==="connecting"?1:0;
  const ledTx=ptt,ledRx=connected&&!ptt,ledCall=!!(incoming||call);

  return <div className="apx-head" style={{"--apx-bright":0.55+brightness*0.15}}>
    <div className="apx-bezel">
      {/* Top accessory row */}
      <div className="apx-top">
        <div className="apx-top-keys">
          <button type="button" className="apx-key inert" tabIndex={-1} aria-hidden="true"><Megaphone size={16}/></button>
          <button type="button" className="apx-key inert text" tabIndex={-1} aria-hidden="true">Manual</button>
          <button type="button" className="apx-key inert" tabIndex={-1} aria-hidden="true"><Waves size={16}/></button>
          <button type="button" className="apx-key inert" tabIndex={-1} aria-hidden="true"><Activity size={16}/></button>
          <button type="button" className="apx-key inert" tabIndex={-1} aria-hidden="true"><Zap size={16}/></button>
        </div>
        <div className="apx-mode">
          <span className="apx-mode-ticks"><b>0</b><b>1</b><b>2</b><b>3</b></span>
          <Knob className="apx-mode-knob" angle={-60+(zoneIndex%4)*40} title={"Zone: "+(zoneName||"All zones")+" (click or scroll to change)"} onClick={()=>stepZone(1)} onStep={stepZone}/>
        </div>
        <div className="apx-top-keys right">
          <button type="button" className="apx-key inert" tabIndex={-1} aria-hidden="true"><Hand size={16}/></button>
          <button type="button" className="apx-key emergency" tabIndex={-1} aria-hidden="true" title="Emergency (not used)"><span/></button>
          <button type="button" className="apx-key inert" tabIndex={-1} aria-hidden="true"><Lightbulb size={16}/></button>
          <button type="button" className="apx-key inert" tabIndex={-1} aria-hidden="true"><Siren size={16}/></button>
          <button type="button" className="apx-key inert text" tabIndex={-1} aria-hidden="true">PA</button>
        </div>
      </div>

      <div className="apx-middle">
        {/* Left column: power, brightness, status LEDs */}
        <div className="apx-left">
          <button type="button" className={"apx-round power"+(connected?" on":"")} onClick={onPower} disabled={state==="connecting"} title={connected?"Power off (disconnect)":"Power on (connect)"}><Power size={16}/></button>
          <div className="apx-leds"><i className={ledTx?"tx":""} title="Transmit"/><i className={ledRx?"rx":""} title="Receive"/><i className={ledCall?"call":""} title="Call"/></div>
          <div className="apx-bright">
            <button type="button" className="apx-round small" onClick={()=>setBrightness(b=>Math.min(3,b+1))} title="Brighter"><Sun size={14}/></button>
            <button type="button" className="apx-round small" onClick={()=>setBrightness(b=>Math.max(0,b-1))} title="Dimmer"><SunDim size={14}/></button>
          </div>
        </div>

        {/* Center: softkeys + display */}
        <div className="apx-center">
          <div className="apx-softkeys">{top.map((k,i)=><button type="button" key={i} className="apx-soft" onClick={k.act||undefined} disabled={!k.act||k.disabled} aria-label={k.label||"Unused softkey"}/>)}</div>
          <div className="apx-display">
            <div className="apx-menu top">{top.map((k,i)=><span key={i}>{k.label}</span>)}</div>
            <div className="apx-icons">
              <span className="apx-bars" title={bars?"Connected":"No signal"}>{[1,2,3,4].map(n=><i key={n} className={n<=bars?"on":""}/>)}</span>
              <Signal size={12} className={connected?"lit":""}/>
              {muted?<VolumeX size={12} className="lit-red"/>:<Volume2 size={12}/>}
              {ptt&&<span className="apx-tag tx">TX</span>}
              {connected&&!ptt&&<span className="apx-tag">RX</span>}
              {(incoming||call)&&<Phone size={12} className="lit"/>}
              <span className="apx-icons-right"><Users size={12}/>{participants.length}<Clock/></span>
            </div>
            <div className="apx-main">
              {view==="who"?<div className="apx-who">
                <strong>Who's On</strong>
                {participants.length?participants.slice(0,4).map(p=>{let info={};try{info=p.metadata?JSON.parse(p.metadata):{}}catch{}return <span key={p.identity}>{info.callsign||info.displayName||p.name||p.identity}</span>}):<span className="dim">{connected?"Nobody else on channel":"Not connected"}</span>}
                {participants.length>4&&<span className="dim">+{participants.length-4} more</span>}
              </div>:entry?<div className="apx-entry"><small>Channel number</small><strong>CH {entry}<i>_</i></strong><small># Enter · * Clear</small></div>:<>
                <div className="apx-zone">{zoneName||"All Zones"}</div>
                <div className="apx-channel">{channelName}</div>
                <div className="apx-chnum">CH {channelNumber??"--"}</div>
              </>}
            </div>
            <div className={"apx-banner "+banner.tone}>
              <strong>{banner.title}</strong>
              {banner.sub&&<span>{banner.icon&&<banner.icon size={11}/>} {banner.sub}</span>}
            </div>
            <div className="apx-menu bottom">{bottom.map((k,i)=><span key={i} className={k.tone||""}>{k.label}</span>)}</div>
          </div>
          <div className="apx-softkeys">{bottom.map((k,i)=><button type="button" key={i} className={"apx-soft "+(k.tone||"")} onClick={k.act||undefined} disabled={!k.act} aria-label={k.label||"Unused softkey"}/>)}</div>
        </div>

        {/* Right: brand, keypad, nav */}
        <div className="apx-right">
          <div className="apx-brand"><span className="apx-brand-mark"><Mic size={11}/></span>REPEATER NATION</div>
          <div className="apx-keypad">{KEYPAD.map(([d,l])=><button type="button" key={d} className="apx-digit" onClick={()=>pressKey(d)}><b>{d}</b><small>{l}</small></button>)}</div>
          <div className="apx-navrow">
            <div className="apx-nav">
              <button type="button" className="up" onClick={()=>stepZone(-1)} title="Previous zone"><ChevronUp size={14}/></button>
              <button type="button" className="left" onClick={()=>stepChannel(-1)} title="Previous channel"><ChevronLeft size={14}/></button>
              <button type="button" className="right" onClick={()=>stepChannel(1)} title="Next channel"><ChevronRight size={14}/></button>
              <button type="button" className="down" onClick={()=>stepZone(1)} title="Next zone"><ChevronDown size={14}/></button>
            </div>
            <button type="button" className="apx-key menu" onClick={()=>setView(v=>v==="who"?"home":"who")} title="Who's On"><Menu size={15}/></button>
          </div>
        </div>
      </div>

      {/* Bottom row: volume knob, P1–P5, home, channel knob */}
      <div className="apx-bottom">
        <Knob className="apx-vol" angle={muted?-135:90} title={muted?"Volume (muted, click to unmute)":"Volume (click to mute)"} onClick={onMute}/>
        <div className="apx-pkeys">
          {[0,1,2,3,4].map(i=><button type="button" key={i} className="apx-pkey" onClick={()=>oneTouch(i)} title={visibleChannels[i]?`P${i+1}: ${visibleChannels[i].name}`:`P${i+1}`}>P{i+1}</button>)}
          <button type="button" className="apx-pkey home" onClick={goHome} title="Home"><Home size={16}/></button>
        </div>
        <Knob className="apx-chan" angle={channelIndex*30} title="Channel (click or scroll to change)" onClick={()=>stepChannel(1)} onStep={stepChannel}/>
      </div>
    </div>
  </div>
}

export function PalmMic({ptt,connected,onDown,onUp,pttName="Space / Num 0"}){
  return <div className="apx-mic">
    <div className="apx-cord"/>
    <div className={"apx-mic-body"+(ptt?" keyed":"")}>
      <span className={"apx-mic-led"+(ptt?" on":"")}/>
      <div className="apx-grille"/>
      <button type="button" className={ptt?"apx-ptt pressed":"apx-ptt"} disabled={!connected} onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture?.(e.pointerId);onDown()}} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp} onContextMenu={e=>e.preventDefault()}>
        <Mic size={18}/><span>PTT</span>
      </button>
      <small>{connected?`Hold to talk${pttName?" · "+pttName:""}`:"Connect to transmit"}</small>
    </div>
  </div>
}
