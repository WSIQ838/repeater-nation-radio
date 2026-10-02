import {useEffect,useRef,useState} from "react";
import {Power,Volume2,VolumeX,Mic,Signal,PhoneIncoming,Phone,Users} from "lucide-react";

// Shared radio face logic, and the O7-style dispatch control head drawn from its reference photo.

export const O7_STATUS_KEYS=["At Scene","En Route","Busy","Returning","Available"];
export const KEYPAD=[["1",". ? !"],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],["7","PQRS"],["8","TUV"],["9","WXYZ"],["*",""],["0","+"],["#",""]];

// Scrolling a knob turns it one detent per notch. The listener is non-passive so the
// wheel does not also scroll the page, and trackpad deltas are summed into detents.
export function Knob({className="",angle=0,label,onClick,onStep,children,title}){
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

// Shared radio behaviour for every radio face: display views, keypad entry, softkey
// menus, banner text, signal bars and mapped-button commands. A face only draws it.
export function useFace(p,{layout}={}){
  const {channelName,channelNumber,zoneName,zones,zoneId,visibleChannels,channelId,
  state,connected,ptt,muted,error,callsign,participants,
  incoming,call,callState,
  onPower,onMute,onChannel,onZone,onTab,onAnswer,onDecline,onEndCall,command,
  quality="unknown",onAir=null,volume=7,onVolume,lastHeard=[],onReplay,flash,
  scanning=false,scanActive=null,onScan,onNuisance,myStatus="",onStatus}=p;
  const o7=layout==="o7";
  const [view,setView]=useState("home");
  const [entry,setEntry]=useState("");
  const [brightness,setBrightness]=useState(3);
  const [notice,setNotice]=useState("");

  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(""),2200);return()=>clearTimeout(id)},[notice]);
  useEffect(()=>setNotice(""),[state]);
  // One-off messages from the app (volume level, time-out timer…) show in the banner.
  useEffect(()=>{if(flash?.text)setNotice(flash.text)},[flash]);

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
  // The O7 head's top row holds status keys, as on the photo ("At Scene"…); pressing
  // the lit one again clears it.
  const top=o7?O7_STATUS_KEYS.map(s=>({label:s,on:myStatus===s,act:onStatus?()=>onStatus(myStatus===s?"":s):null})):[
    {label:connected?"Off":"Connect",act:onPower,disabled:state==="connecting"},
    {label:muted?"Unmute":"Mute",act:onMute},
    {label:view==="who"?"Back":"Who's On",act:()=>setView(v=>v==="who"?"home":"who")},
    {label:scanning?"Scan Off":"Scan",act:onScan,disabled:!onScan},
    {label:"Setup",act:()=>onTab("settings")},
  ];
  const replayLast=()=>{if(!onReplay?.())setNotice("Nothing to replay yet")};
  const bottom=view==="recent"?[
    {label:"Back",act:()=>setView("home")},
    {label:"Replay",act:replayLast},
    {label:"",act:null},{label:"",act:null},
    {label:"Contacts",act:()=>onTab("calls")},
  ]:incoming?[
    {label:"Answer",act:onAnswer,tone:"go"},
    {label:"Decline",act:onDecline,tone:"stop"},
    {label:"",act:null},{label:"",act:null},
    {label:"Contacts",act:()=>onTab("calls")},
  ]:call?[
    {label:"End Call",act:onEndCall,tone:"stop"},
    {label:"",act:null},{label:"",act:null},{label:"",act:null},
    {label:"Contacts",act:()=>onTab("calls")},
  ]:o7?[
    {label:"Channel",act:()=>{setEntry("");setView(v=>v==="chan"?"home":"chan")}},
    {label:scanning?"Scan Off":"Scan",act:onScan,disabled:!onScan},
    scanActive?{label:"Nuis Del",act:onNuisance}:{label:"Page",act:()=>onTab("calls")},
    {label:"Contacts",act:()=>onTab("members")},
    {label:"Recent",act:()=>setView("recent")},
  ]:[
    {label:"Chan −",act:()=>stepChannel(-1)},
    {label:"Chan +",act:()=>stepChannel(1)},
    scanActive?{label:"Nuis Del",act:onNuisance}:{label:"Zone",act:()=>stepZone(1)},
    {label:"Recent",act:()=>setView("recent")},
    {label:"Contacts",act:()=>onTab("calls")},
  ];

  // Mapped hardware buttons for face-only controls arrive as one-shot commands.
  useEffect(()=>{
    if(!command||command.done)return;
    command.done=true;
    const a=command.action;
    if(a==="home")goHome();
    else if(a==="who")setView(v=>v==="who"?"home":"who");
    else if(a==="recent")setView(v=>v==="recent"?"home":"recent");
    else if(a==="replay")replayLast();
    else if(a==="bright_up")setBrightness(b=>Math.min(3,b+1));
    else if(a==="bright_down")setBrightness(b=>Math.max(0,b-1));
    else if(/^soft_[tb][1-5]$/.test(a)){const k=(a[5]==="t"?top:bottom)[Number(a[6])-1];if(k?.act&&!k.disabled)k.act()}
    else if(a.startsWith("key_"))pressKey(a.slice(4));
  },[command]);

  let banner=null;
  if(ptt)banner={tone:"tx",title:"Transmitting",sub:callsign||""};
  else if(onAir)banner={tone:"rx",title:"Receiving",sub:onAir.name};
  else if(scanActive)banner={tone:"rx",title:"Scan · "+scanActive.name,sub:[scanActive.zoneName,scanActive.talker].filter(Boolean).join(" · ")};
  else if(incoming)banner={tone:"rx",title:"Call Received",sub:incoming.caller_display_name||incoming.caller_callsign||"Member",icon:PhoneIncoming};
  else if(call)banner={tone:"call",title:callState==="calling"?"Calling…":"Call Connected",sub:call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member",icon:Phone};
  else if(error)banner={tone:"warn",title:error};
  else if(notice)banner={tone:"warn",title:notice};
  else if(state==="connecting")banner={tone:"idle",title:"Connecting…"};
  else if(connected)banner={tone:"listen",title:"Listening",sub:participants.length+" on channel"};
  else banner={tone:"idle",title:"Radio Off",sub:"Press Connect or power"};

  const QUALITY_BARS={excellent:4,good:3,poor:1,lost:0};
  const bars=connected?(QUALITY_BARS[quality]??4):state==="connecting"?1:0;
  const ledTx=ptt,ledRx=!!(onAir||scanActive)&&!ptt,ledCall=!!(incoming||call);

  return {view,setView,entry,setEntry,brightness,setBrightness,notice,setNotice,channelIndex,zoneIndex,stepChannel,stepZone,pressKey,goHome,oneTouch,top,bottom,replayLast,banner,bars,ledTx,ledRx,ledCall};
}

// The display contents (menus, status icons, channel/zone, Who's On, Recent, banner).
export function FaceDisplay({p,f,className="apx-display",menus=true,softRow=null}){
  const {channelName,channelNumber,zoneName,connected,ptt,muted,participants,incoming,call,quality="unknown",lastHeard=[],scanning=false}=p;
  const {view,entry,top,bottom,banner,bars}=f;
  return <div className={className}>
            {menus&&<div className="apx-menu top">{top.map((k,i)=><span key={i} className={k.on?"on":undefined}>{k.label}</span>)}</div>}
            <div className="apx-icons">
              <span className="apx-bars" title={connected?"Connection: "+(quality==="unknown"?"checking":quality):"No signal"}>{[1,2,3,4].map(n=><i key={n} className={n<=bars?"on":""}/>)}</span>
              <Signal size={12} className={connected?"lit":""}/>
              {muted?<VolumeX size={12} className="lit-red"/>:<Volume2 size={12}/>}
              {ptt&&<span className="apx-tag tx">TX</span>}
              {connected&&!ptt&&<span className="apx-tag">RX</span>}
              {scanning&&<span className="apx-tag">SCAN</span>}
              {(incoming||call)&&<Phone size={12} className="lit"/>}
              <span className="apx-icons-right"><Users size={12}/>{participants.length}<Clock/></span>
            </div>
            <div className="apx-main">
              {view==="recent"?<div className="apx-who apx-recent">
                <strong>Recent</strong>
                {lastHeard.length?lastHeard.slice(0,4).map(x=><span key={x.id}>{x.name}<i>{new Date(x.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} · {Math.max(1,Math.round(x.ms/1000))}s</i></span>):<span className="dim">Nothing heard yet</span>}
              </div>:view==="who"?<div className="apx-who">
                <strong>Who's On</strong>
                {participants.length?participants.slice(0,4).map(p=>{let info={};try{info=p.metadata?JSON.parse(p.metadata):{}}catch{}return <span key={p.identity}>{info.callsign||info.displayName||p.name||p.identity}</span>}):<span className="dim">{connected?"Nobody else on channel":"Not connected"}</span>}
                {participants.length>4&&<span className="dim">+{participants.length-4} more</span>}
              </div>:entry||view==="chan"?<div className="apx-entry"><small>Channel number</small><strong>CH {entry}<i>_</i></strong><small># Enter · * Clear</small></div>:<>
                <div className="apx-zone">{zoneName||"All Zones"}</div>
                <div className="apx-channel">{channelName}</div>
                <div className="apx-chnum">CH {channelNumber??"--"}</div>
              </>}
            </div>
            <div className={"apx-banner "+banner.tone}>
              <strong>{banner.title}</strong>
              {banner.sub&&<span>{banner.icon&&<banner.icon size={11}/>} {banner.sub}</span>}
            </div>
            {menus?<div className="apx-menu bottom">{bottom.map((k,i)=><span key={i} className={k.tone||""}>{k.label}</span>)}</div>:softRow&&<div className="apx-menu bottom">{softRow.map((k,i)=><span key={i} className={k.tone||""}>{k.label}</span>)}</div>}
          
  </div>;
}

// O7 control head, laid out from the reference photo. Every position below is the
// photo's own pixel box (radio body at x 42–399, y 19–356) scaled to a 600 px head,
// so a key can be checked against the picture by its numbers. The siren, horn,
// lights, PA and emergency keys are vehicle controls and stay inert.
const O7_K=600/357,r1=n=>Math.round(n*10)/10;
const at=(x1,y1,x2,y2)=>({left:r1((x1-42)*O7_K),top:r1((y1-19)*O7_K),width:r1((x2-x1)*O7_K),height:r1((y2-y1)*O7_K)});
const dot=(cx,cy,d)=>at(cx-d/2,cy-d/2,cx+d/2,cy+d/2);
const SOFT_X=[[101,130],[135,164],[169,199],[204,232],[237,267]],SOFT_TOP=[121,138],SOFT_BOTTOM=[280,297];
const KEY_COLS=[[294,320],[325,350],[354,380]],KEY_ROWS=[[149,172],[175,198],[201,224],[227,250]];
const P_X=[[103,135],[138,168],[173,203],[208,238],[243,275]];
const MODE_ANGLES=[-50,-12,18,52];// knob pointer at 0, 1, 2 and 3
const O7_KEYS=[["1",". , ?"],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],["7","PQRS"],["8","TUV"],["9","WXYZ"],["*","space"],["0","shift"],["#","lock"]];

const Svg=({w=24,h=24,children,...r})=><svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true" {...r}>{children}</svg>;
const O7Icon={
  horn:<Svg w={34} h={18}><path d="M2 7h4v4H2zM6 7.5h6L28 2v14L12 10.5H6z" fill="currentColor"/><path d="M27 2.5c2 .5 3 3.5 3 6.5s-1 6-3 6.5" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M12 11c0 4.5 6 4.5 6 0" fill="none" stroke="currentColor" strokeWidth="1.7"/></Svg>,
  wail:<Svg w={22} h={18}><path d="M2.5 13C3.5 3 8.5 1.5 10.5 9s7.5 8 9-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/></Svg>,
  yelp:<Svg w={22} h={18}><path d="M2.5 15 7.5 4.5l2.5 8 5-9.5.8 12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></Svg>,
  phaser:<Svg w={20} h={22}><path d="M13 1 5 12h5l-3.5 9L15 9.5h-5L13.5 1z" fill="currentColor"/></Svg>,
  beacon:<Svg w={24} h={22}><path d="M6.5 2.5 7.5 7M9.8 1.5v5.5M12.5 1v6M15.2 1.5v5.5M18.5 2.5 17.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M4.5 10h15a7.5 7 0 0 1-15 0z" fill="currentColor"/></Svg>,
  lightLeft:<Svg w={26} h={18}><path d="M2 4.5l6 1.5M2 9h6M2 13.5l6-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M11 2.5h3a6.5 6.5 0 0 1 0 13h-3z" fill="currentColor"/></Svg>,
  lightRight:<Svg w={26} h={18}><path d="M24 4.5l-6 1.5M24 9h-6M24 13.5l-6-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M15 2.5h-3a6.5 6.5 0 0 0 0 13h3z" fill="currentColor"/></Svg>,
  sun:<Svg w={20} h={20}><circle cx="10" cy="10" r="3.6" fill="currentColor"/><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3M4 4l2.1 2.1M13.9 13.9 16 16M4 16l2.1-2.1M13.9 6.1 16 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></Svg>,
  dayNight:<Svg w={20} h={20}><circle cx="10.5" cy="11" r="7" fill="currentColor"/><circle cx="14" cy="8.5" r="6" fill="#323136"/><path d="M5 2.5v3M3.5 4h3M2.8 2.3l1.4 1.4M7.2 2.3 5.8 3.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></Svg>,
  backlight:<Svg w={20} h={20}><circle cx="10" cy="9" r="3" fill="currentColor"/><path d="M10 1.5v2.5M3.5 9H6M14 9h2.5M5 4l1.7 1.7M15 4l-1.7 1.7M8 13h4M8.5 15.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M3 18 17 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></Svg>,
  laptop:<Svg w={24} h={22}><path d="M8 2.5h12l-2.5 10H5.5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M4 14h14l-2 4H1.5z" fill="currentColor"/></Svg>,
  home:<Svg w={22} h={20}><path d="M11 1.5 1.5 9h19z" fill="currentColor"/><path d="M4 10h14v8.5h-4.5v-5h-5v5H4z" fill="currentColor"/></Svg>,
  space:<Svg w={12} h={6}><path d="M1.5 1v3h9V1" fill="none" stroke="currentColor" strokeWidth="1.4"/></Svg>,
  shift:<Svg w={12} h={10}><path d="M6 1 1.5 5.5H4V9h4V5.5h2.5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></Svg>,
  lock:<Svg w={12} h={10}><circle cx="4" cy="3.6" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="6.6" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.3"/></Svg>,
};

export function ControlHead(p){
  const {zoneName,state,connected,muted,volume=7,visibleChannels,onPower,onMute,onVolume}=p;
  const f=useFace(p,{layout:"o7"});
  const {setView,brightness,setBrightness,channelIndex,zoneIndex,stepChannel,stepZone,pressKey,goHome,oneTouch,top,bottom,ledTx,ledRx,ledCall}=f;
  const [night,setNight]=useState(false);
  const soft=(row,y)=>row.map((k,i)=><button type="button" key={i} className={"o7-soft"+(k.on?" on":"")+(k.tone?" "+k.tone:"")} style={at(SOFT_X[i][0],y[0],SOFT_X[i][1],y[1])}
    onClick={k.act||undefined} disabled={!k.act||k.disabled} aria-label={k.label||"Unused softkey"} title={k.label||undefined}><i/></button>);
  const inert=(box,content,cls="")=><div className={"o7-key inert "+cls} style={box} aria-hidden="true">{content}</div>;
  return <div className="o7" style={{"--apx-bright":0.55+brightness*0.15}}>
    <div className="o7-seam" style={at(46,112,395,114)}/>
    <div className="o7-seam" style={at(46,299,395,301)}/>

    {/* Top accessory keys and the 0–3 mode knob (zone select) */}
    {inert(at(70,45,110,72),O7Icon.horn)}
    {inert(at(118,45,158,72),"Manual","text")}
    {inert(at(70,80,96,103),O7Icon.wail)}
    {inert(at(101,80,127,103),O7Icon.yelp)}
    {inert(at(132,80,158,103),O7Icon.phaser)}
    <div className="o7-collar" style={at(170.5,22,260.5,112)}/>
    {[["0",182,51],["1",202.5,35.5],["2",229,35.5],["3",249,51]].map(([n,x,y])=><span key={n} className="o7-tick" style={dot(x,y,10.5)}>{n}</span>)}
    <div className="o7-hold" style={at(181,42,250,110)}><Knob className="o7-mode" angle={MODE_ANGLES[zoneIndex%4]} title={"Zone: "+(zoneName||"All zones")+" (click or scroll to change)"} onClick={()=>stepZone(1)} onStep={stepZone}/></div>
    {inert(at(283,45,325,72),O7Icon.beacon)}
    <div className="o7-boss" style={at(349,30,390,77)} aria-hidden="true"/>
    <div className="o7-emerg" style={dot(367,57,19)} title="Emergency (not used)" aria-hidden="true"/>
    {inert(at(275,80,302,105),O7Icon.lightLeft)}
    {inert(at(306,80,333,105),O7Icon.lightRight)}
    {inert(at(352,80,380,105),"PA","text pa")}

    {/* Left column: power, status LEDs, brightness rocker, day/night, backlight */}
    <button type="button" className={"o7-round o7-power"+(connected?" on":"")} style={dot(64,134,20)} onClick={onPower} disabled={state==="connecting"} title={connected?"Power off (disconnect)":"Power on (connect)"}><Power size={15} strokeWidth={2.6}/></button>
    <i className={"o7-led"+(ledTx?" tx":"")} style={at(59,155.5,71,158.5)} title="Transmit"/>
    <i className={"o7-led"+(ledRx?" rx":"")} style={at(59,165.5,71,168.5)} title="Receive"/>
    <i className={"o7-led"+(ledCall?" call":"")} style={at(59,175.5,71,178.5)} title="Call"/>
    <div className="o7-rocker" style={at(55,188,75,231)}>
      <button type="button" onClick={()=>setBrightness(b=>Math.min(3,b+1))} title="Brighter">+</button>
      <span>{O7Icon.sun}</span>
      <button type="button" onClick={()=>setBrightness(b=>Math.max(0,b-1))} title="Dimmer">−</button>
    </div>
    <button type="button" className={"o7-round"+(night?" lit":"")} style={dot(65,254,19)} onClick={()=>setNight(n=>!n)} title={night?"Day display":"Night display"}>{O7Icon.dayNight}</button>
    <button type="button" className="o7-round" style={dot(65,279,19)} onClick={()=>setBrightness(b=>b>0?0:3)} title="Backlight">{O7Icon.backlight}</button>

    {/* Softkeys around the display */}
    {soft(top,SOFT_TOP)}
    <div className="o7-bezel" style={at(89,147,282,271)}/>
    <div className="o7-screen" style={at(95,153,276,265)}><FaceDisplay p={p} f={f} className={"o7-display"+(night?" night":"")}/></div>
    {soft(bottom,SOFT_BOTTOM)}

    {/* Right: badge, keypad, nav pad, Who's On key */}
    <div className="o7-logo" style={at(292,122,382,141)}><span className="o7-logo-mark"><Mic size={11} strokeWidth={2.6}/></span><b>REPEATER NATION</b></div>
    {O7_KEYS.map(([d,l],i)=><button type="button" key={d} className="o7-key o7-digit" style={at(KEY_COLS[i%3][0],KEY_ROWS[i/3|0][0],KEY_COLS[i%3][1],KEY_ROWS[i/3|0][1])} onClick={()=>pressKey(d)} aria-label={d}>
      <b>{d}</b><small>{O7Icon[l]||l}</small></button>)}
    <div className="o7-key o7-nav" style={at(294,258,347,293)}>
      <button type="button" className="up" onClick={()=>stepZone(-1)} title="Previous zone"/>
      <button type="button" className="down" onClick={()=>stepZone(1)} title="Next zone"/>
      <button type="button" className="left" onClick={()=>stepChannel(-1)} title="Previous channel"/>
      <button type="button" className="right" onClick={()=>stepChannel(1)} title="Next channel"/>
    </div>
    <button type="button" className="o7-key" style={at(357,258,381,293)} onClick={()=>setView(v=>v==="who"?"home":"who")} title="Who's On">{O7Icon.laptop}</button>

    {/* Bottom: volume knob, P1–P5, home, channel knob */}
    <div className="o7-hold" style={at(46,301,95,350)}><Knob className="o7-vol" angle={muted?-135:-135+volume*27} title={muted?"Volume (muted, click to unmute)":`Volume ${volume} (scroll to change, click to mute)`} onClick={onMute} onStep={dir=>onVolume?.(-dir)}/></div>
    {P_X.map(([x1,x2],i)=><button type="button" key={i} className={"o7-key o7-pkey"+(i===0?" first":i===4?" last":"")} style={at(x1,312,x2,340)} onClick={()=>oneTouch(i)} title={visibleChannels[i]?`P${i+1}: ${visibleChannels[i].name}`:`P${i+1}`}>P{i+1}</button>)}
    <button type="button" className="o7-key o7-home" style={at(285,312,331,340)} onClick={goHome} title="Home">{O7Icon.home}</button>
    <div className="o7-hold" style={at(342,302,392,352)}><Knob className="o7-chan" angle={channelIndex*30} title="Channel (click or scroll to change)" onClick={()=>stepChannel(1)} onStep={stepChannel}/></div>
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
