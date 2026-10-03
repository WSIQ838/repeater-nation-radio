import {useEffect,useState} from "react";
import {ChevronLeft,ListChecks,Power,RefreshCw,Sun,UserRound,Users,Volume2,VolumeX} from "lucide-react";
import {Knob,photoBoxes,useFace} from "./ControlHead";
import {STATUSES,statusClass} from "../lib/status";

// Touchscreen handheld, laid out from Sean's APX N70 photo (205×768). The body is one
// SVG drawn in the photo's own pixels; the knobs, keys and screen sit on top at the
// same photo boxes, scaled by K.
const K=1.8;
const {at,dot}=photoBoxes(0,0,K);
// Boxes inside the display (it starts at photo x 49, y 474) and inside each of its cards.
const S=photoBoxes(49,474,K),H=photoBoxes(51,493,K),Z=photoBoxes(51,515,K),M=photoBoxes(51,589,K),L=photoBoxes(51,634,K);
export const hhmm=t=>new Date(t).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
export const clock=t=>{const d=new Date(t);return (d.getHours()%12||12)+":"+String(d.getMinutes()).padStart(2,"0")};
export const secs=ms=>Math.max(1,Math.round(ms/1000))+"s";

export const pttHandlers=(onDown,onUp)=>({
  onPointerDown:e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture?.(e.pointerId);onDown?.()},
  onPointerUp:()=>onUp?.(),onPointerCancel:()=>onUp?.(),onLostPointerCapture:()=>onUp?.(),onContextMenu:e=>e.preventDefault(),
});

// A fluted knob seen from the front. The flutes are drawn around a cylinder, so turning
// the knob (turn, in radians) slides them across its face like the real one.
export function Flutes({cx,top,bottom,rTop,rBottom,n,turn,width,slant=0,end="round"}){
  const out=[];
  for(let i=0;i<n;i++){
    const a=turn+i*2*Math.PI/n,c=Math.cos(a),s=Math.sin(a);
    if(c<0.12)continue;
    const w=width*c,xt=cx+rTop*s+slant,xb=cx+rBottom*s;
    out.push(<path key={i} d={`M${xt-w/2},${top} L${xt+w/2},${top} L${xb+w/2},${bottom-(end==="round"?w/2:0)} ${end==="round"?`A${w/2},${w/2} 0 0 1 ${xb-w/2},${bottom-w/2}`:`L${xb-w/2},${bottom}`} Z`}
      fill="#111214" opacity={0.4+0.6*c} stroke="#9a9c9e" strokeOpacity={0.3*c} strokeWidth="0.35"/>);
  }
  return out;
}
function ChannelKnob({f,channels}){
  const n=Math.max(1,channels.length),pos=f.channelIndex;
  const num=i=>channels.length?(((pos+i)%n+n)%n)+1:"";
  return <svg viewBox="80 340 46 62" className="hh-knob-svg" aria-hidden="true">
    <defs>
      <linearGradient id="hhKnobT" x1="0" x2="1"><stop offset="0" stopColor="#1b1d1f"/><stop offset=".3" stopColor="#4c4e50"/><stop offset=".5" stopColor="#8a8c8e"/><stop offset=".72" stopColor="#404244"/><stop offset="1" stopColor="#17191b"/></linearGradient>
      <linearGradient id="hhCollar" x1="0" x2="1"><stop offset="0" stopColor="#131416"/><stop offset=".5" stopColor="#3c3e40"/><stop offset="1" stopColor="#121315"/></linearGradient>
      <clipPath id="hhKnobClip"><path d="M90.6,351 Q91,342.6 102.5,342.4 Q114,342.6 114.4,351 L117.2,384 L87.8,384 Z"/></clipPath>
    </defs>
    <path d="M85.2,385.5 L119.8,385.5 L123,401.5 L82,401.5 Z" fill="url(#hhCollar)"/>
    <text x="102.5" y="397.6" textAnchor="middle" fontSize="6.4" fontWeight="700" fill="#e8e9ea" fontFamily="Arial,sans-serif">{channels.length?`${num(-1)} · ${num(0)} · ${num(1)}`:"·  ·  ·"}</text>
    <path d="M90.6,351 Q91,342.6 102.5,342.4 Q114,342.6 114.4,351 L117.2,384 L87.8,384 Z" fill="url(#hhKnobT)"/>
    <g clipPath="url(#hhKnobClip)"><Flutes cx={102.5} top={347} bottom={381} rTop={11.6} rBottom={14.2} n={12} width={4.4} turn={pos*Math.PI/6}/></g>
    <path d="M87.6,383.5 L117.4,383.5 L118.4,387 L86.6,387 Z" fill="#26282a"/>
  </svg>;
}
function VolumeKnob({volume,muted}){
  return <svg viewBox="157 372 42 32" className="hh-knob-svg" aria-hidden="true">
    <defs>
      <linearGradient id="hhKnobV" x1="0" x2="1"><stop offset="0" stopColor="#17181a"/><stop offset=".35" stopColor="#4a4c4e"/><stop offset=".55" stopColor="#737577"/><stop offset=".8" stopColor="#333537"/><stop offset="1" stopColor="#131416"/></linearGradient>
      <clipPath id="hhVolClip"><path d="M160,385 Q160.5,376.4 178,375.8 Q195.5,376.4 196,385 L195,402 L161,402 Z"/></clipPath>
    </defs>
    <path d="M160,385 Q160.5,376.4 178,375.8 Q195.5,376.4 196,385 L195,402 L161,402 Z" fill="url(#hhKnobV)"/>
    <g clipPath="url(#hhVolClip)"><Flutes cx={178} top={376} bottom={403} rTop={17.5} rBottom={17.5} n={16} width={2.6} slant={2.6} end="flat" turn={(muted?0:volume)*Math.PI/9}/></g>
  </svg>;
}

// The handheld's static body in photo pixels: antenna, housing, side grips (lighter
// toward the bottom, as in the photo), front cover, glass, chin and key trough.
function Body(){
  return <svg className="hh-body" viewBox="0 0 205 768" aria-hidden="true">
    <defs>
      <linearGradient id="hhAnt" x1="19" x2="43" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#1e2022"/><stop offset=".17" stopColor="#2c2e30"/><stop offset=".3" stopColor="#4e5052"/><stop offset=".46" stopColor="#8f9193"/><stop offset=".56" stopColor="#76787a"/><stop offset=".72" stopColor="#45474a"/><stop offset=".8" stopColor="#2c2e30"/><stop offset="1" stopColor="#1e2022"/></linearGradient>
      <linearGradient id="hhAntRamp" x1="0" y1="250" x2="0" y2="322" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#fff"/></linearGradient>
      <mask id="hhAntFade" maskUnits="userSpaceOnUse" x="0" y="240" width="60" height="170"><rect x="0" y="240" width="60" height="170" fill="url(#hhAntRamp)"/></mask>
      <linearGradient id="hhAntBase" x1="0" x2="1"><stop offset="0" stopColor="#1e2022"/><stop offset=".12" stopColor="#2c2e30"/><stop offset=".3" stopColor="#4e5052"/><stop offset=".47" stopColor="#8f9193"/><stop offset=".58" stopColor="#76787a"/><stop offset=".78" stopColor="#3a3c3e"/><stop offset="1" stopColor="#1e2022"/></linearGradient>
            <linearGradient id="hhBody" x1="0" x2="1"><stop offset="0" stopColor="#222425"/><stop offset=".05" stopColor="#36383a"/><stop offset=".95" stopColor="#36383a"/><stop offset="1" stopColor="#1f2122"/></linearGradient>
      <linearGradient id="hhCover" x1="0" y1="401" x2="0" y2="751" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#656769"/><stop offset=".1" stopColor="#5d5f61"/><stop offset=".2" stopColor="#4c4e50"/><stop offset=".7" stopColor="#45474a"/><stop offset="1" stopColor="#3d3f41"/></linearGradient>
      <linearGradient id="hhGripL" x1="0" y1="476" x2="0" y2="742" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#45474a"/><stop offset=".5" stopColor="#434547"/><stop offset=".6" stopColor="#6c6e70"/><stop offset=".85" stopColor="#7b7d7f"/><stop offset="1" stopColor="#5c5e60"/></linearGradient>
      <linearGradient id="hhGripR" x1="0" y1="476" x2="0" y2="742" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#45474a"/><stop offset=".4" stopColor="#434547"/><stop offset=".5" stopColor="#7a7c7e"/><stop offset=".85" stopColor="#838587"/><stop offset="1" stopColor="#66686a"/></linearGradient>
      <linearGradient id="hhChin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#66686a"/><stop offset=".35" stopColor="#77797b"/><stop offset="1" stopColor="#6a6c6e"/></linearGradient>
      <linearGradient id="hhFoot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a2c2e"/><stop offset="1" stopColor="#111315"/></linearGradient>
      <pattern id="hhGrip" width="2.2" height="2.2" patternUnits="userSpaceOnUse"><circle cx="1.1" cy="1.1" r=".5" fill="#000" opacity=".22"/></pattern>
    </defs>
    {/* antenna */}
    <path d="M19.8,8 Q19.8,1 31,1 Q42.2,1 42.2,8 L42.2,12.4 Q42,17 38.6,23 L38,32 L39,255 C40,276 47,318 47,338 L47,404 L15,404 L15,338 C15,318 22,276 22,255 L23,32 L22.4,23 Q20,17 19.8,12.4 Z" fill="url(#hhAnt)"/>
    <path d="M22,250 L39,250 C40,276 47,318 47,338 L47,404 L15,404 L15,338 C15,318 22,276 22,250 Z" fill="url(#hhAntBase)" mask="url(#hhAntFade)"/>
    <path d="M20.6,5.4 Q22,1.6 31,1.6 Q40,1.6 41.4,5.4 Z" fill="#141517" opacity=".7"/>
    <rect x="19.9" y="8.6" width="22.2" height="2.6" rx="1.2" fill="#9a9c9e" opacity=".3"/>
    <rect x="21.5" y="334" width="19" height="33" rx="9.5" fill="none" stroke="#1d1f21" strokeWidth="1.1"/>
    <text transform="translate(34.4 350.5) rotate(90)" textAnchor="middle" fontSize="7.2" fontWeight="800" fill="#1d1f21" fontFamily="Arial,sans-serif">GMRS</text>
    {/* small top button between the knobs */}
    <rect x="141.6" y="392" width="11.6" height="11" rx="2.6" fill="#3e4042" stroke="#1a1c1e" strokeWidth=".6"/>
    <rect x="142.8" y="393" width="9.2" height="2.2" rx="1" fill="#6d6f71"/>
    {/* housing, side grips and grooves */}
    <path d="M24,401 L182,401 Q198,402 200,424 L203,452 Q203.5,462 196,470 Q188,478 185,488 L183,500 L183,734 Q181,763 160,767.5 L45,767.5 Q25,763 23.5,734 L23,500 Q20,481 9,469 Q1,461 1.2,450 L4,424 Q7,402 24,401 Z" fill="url(#hhBody)" stroke="#141516" strokeWidth=".8"/>
    <path d="M3.6,424 Q4.6,412 10,410.6 L195,410.6 Q199.6,412 200.6,424" fill="none" stroke="#252729" strokeWidth=".8"/>
    <path d="M23.4,478 Q27,477 33.5,477 L33.5,744 Q27,743 24.5,738 L23.4,734 Z" fill="url(#hhGripL)"/>
    <path d="M171,477 Q178,477 182.8,478 L182.8,734 Q181.5,742 176,744 L171,744 Z" fill="url(#hhGripR)"/>
    <path d="M23.4,478 L33.5,477 L33.5,744 L23.4,734 Z M171,477 L182.8,478 L182.8,734 L171,744 Z" fill="url(#hhGrip)"/>
    <rect x="33.4" y="470" width="3.4" height="278" fill="#202224"/>
    <rect x="168.2" y="470" width="3" height="278" fill="#202224"/>
    <path d="M23.6,700 L32,700 L35,706 L32,712 L23.6,712" fill="#202224"/>
    <path d="M182.5,700 L174,700 L171,706 L174,712 L182.5,712" fill="#202224"/>
    {/* front cover with the head panel, glass and chin */}
    <path d="M44,401 L161,401 L163,440 Q168,446 168.4,456 L168.4,738 Q168.4,751 156,751 L50,751 Q36.6,751 36.6,738 L36.6,456 Q37,446 42,440 Z" fill="url(#hhCover)"/>
    <path d="M37.6,458 L37.6,738" stroke="#5a5c5e" strokeWidth="1.2"/>
    <path d="M167.4,458 L167.4,738" stroke="#505254" strokeWidth="1"/>
    <line x1="44" y1="410.8" x2="161" y2="410.8" stroke="#4e5052" strokeWidth=".7"/>
    <path d="M42,657 L164,657 L156,676 L50,676 Z" fill="url(#hhChin)"/>
    <rect x="45.4" y="443.6" width="115.2" height="214.4" rx="9.5" fill="#141617" stroke="#090a0b" strokeWidth=".9"/>
    <circle cx="54" cy="465" r="1.7" fill="#2a2c2e"/>
    <rect x="49" y="474" width="107" height="180" fill="#2c2c2e"/>
    <rect x="80.6" y="669.8" width="44" height="21.6" rx="10.8" fill="#141618"/>
    {/* P key trough with a light ledge under each row */}
    <path d="M44,700 Q44,693 51,693 L156,693 Q163,693 163,700 L163,744 Q163,749 157,749 L50,749 Q44,749 44,744 Z" fill="#17191a"/>
    <rect x="46" y="715.4" width="115" height="1.3" fill="#8a8c8e" opacity=".85"/>
    <rect x="46" y="716.7" width="115" height="3.4" fill="#36383a"/>
    <rect x="46" y="741.4" width="115" height="1.3" fill="#a0a2a4" opacity=".85"/>
    <rect x="46" y="742.7" width="115" height="4" fill="#2a2c2e"/>
    <path d="M36.8,751 L168.4,751 L183,734 Q181,763 160,767.5 L45,767.5 Q25,763 23.5,734 Z" fill="url(#hhFoot)"/>
  </svg>;
}

// The touch screen: header, zone/channel card, tabs, last-heard card and status bar,
// all live; Zone, More, the channel name and the profile icon open list screens.
function Screen({p,f,screen,setScreen}){
  const {channelName,zoneName,zones=[],zoneId,visibleChannels=[],channelId,connected,muted,participants=[],lastHeard=[],
    myStatus="",onStatus,onScan,scanning,onTab,onReplay,incoming,call,callState,onAnswer,onDecline,onEndCall,state,onPower,onChannel,onZone,displayName,callsign}=p;
  const b=f.banner,last=lastHeard[0];
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(id)},[]);
  const list=(title,items)=><div className="hh-list" style={S.at(51,493,154,654)}>
    <button type="button" className="hh-back" onClick={()=>setScreen("home")}><ChevronLeft size={13}/>{title}</button>
    <div className="hh-items">{items}</div>
  </div>;
  const who=x=>{let info={};try{info=x.metadata?JSON.parse(x.metadata):{}}catch{}return info.callsign||info.displayName||x.name||x.identity};
  let body;
  if(screen==="status")body=list("My Status",STATUSES.map(s=><button type="button" key={s} className={"hh-item "+(s===myStatus?"on ":"")+statusClass(s)} onClick={()=>{onStatus?.(s===myStatus?"":s);setScreen("home")}}>{s}</button>));
  else if(screen==="zones")body=list("Zone",zones.length?zones.map(z=><button type="button" key={z.id} className={"hh-item"+(z.id===zoneId?" on":"")} onClick={()=>{onZone?.(z.id);setScreen("home")}}>{z.name}</button>):<div className="hh-dim">No zones</div>);
  else if(screen==="channels")body=list(zoneName||"Channels",visibleChannels.length?visibleChannels.map(c=><button type="button" key={c.id} className={"hh-item"+(c.id===channelId?" on":"")} onClick={()=>{onChannel?.(c.id);setScreen("home")}}><small>{c.number}</small>{c.name}</button>):<div className="hh-dim">No channels</div>);
  else if(screen==="who")body=list("Who's On",participants.length?participants.map(x=><div className="hh-item" key={x.identity}><UserRound size={12}/>{who(x)}{x.attributes?.status&&<em className={"status-chip "+statusClass(x.attributes.status)}>{x.attributes.status}</em>}</div>):<div className="hh-dim">{connected?"Nobody else on channel":"Not connected"}</div>);
  else if(screen==="recent")body=list("Recent",lastHeard.length?lastHeard.slice(0,8).map(x=><button type="button" className="hh-item" key={x.id} onClick={()=>onReplay?.(x.id)} disabled={!x.url}>{x.name}<small className="hh-right">{hhmm(x.at)} · {secs(x.ms)}</small></button>):<div className="hh-dim">Nothing heard yet</div>);
  else if(screen==="more")body=list("More",<>
    <button type="button" className="hh-item" onClick={()=>setScreen("who")}><Users size={12}/>Who's On ({participants.length})</button>
    <button type="button" className="hh-item" onClick={()=>setScreen("recent")}><RefreshCw size={12}/>Recent</button>
    <button type="button" className="hh-item" onClick={()=>setScreen("status")}><UserRound size={12}/>My Status</button>
    <button type="button" className="hh-item" onClick={()=>f.setBrightness(x=>x>0?x-1:3)}><Sun size={12}/>Brightness</button>
    <button type="button" className="hh-item" onClick={()=>{onPower?.();setScreen("home")}} disabled={state==="connecting"}><Power size={12}/>{connected?"Radio off":"Radio on"}</button>
    <button type="button" className="hh-item" onClick={()=>onTab("settings")}><ListChecks size={12}/>Setup</button>
  </>);
  else body=<>
    <div className="hh-card hh-head" style={S.at(51,493,154,513)}>
      <span className="hh-name">{displayName||callsign||"Member"}</span>
      <button type="button" className="hh-profile" style={H.dot(145.5,503.5,10)} onClick={()=>setScreen("status")} title="My status" aria-label="My status"><UserRound size={11} strokeWidth={2.6}/></button>
    </div>
    <div className="hh-card hh-zonecard" style={S.at(51,515,154,563)}>
      <i className={"hh-strip "+b.tone}/>
      <div className="hh-icons" style={Z.at(60,517.5,120,525.5)}>
        <span className="hh-bars" title={connected?"Signal":"No signal"}>{[1,2,3,4].map(n=><i key={n} className={n<=f.bars?"on":""}/>)}</span>
        {muted?<VolumeX size={8.5} strokeWidth={3}/>:<Volume2 size={8.5} strokeWidth={3}/>}
        <b className={scanning?"":"off"} title="Scan">Z</b>
        <b className={connected?"":"off"} title={connected?"On air":"Off"}>{f.ledTx?"TX":"H"}</b>
        <Users size={8.5} strokeWidth={3}/><b>{participants.length}</b>
      </div>
      <button type="button" className="hh-zone" style={Z.at(59,526,128,537)} onClick={()=>setScreen("zones")} title="Choose zone">{zoneName||"All Zones"}</button>
      <button type="button" className="hh-chan" style={Z.at(59,537.5,135,550)} onClick={()=>setScreen("channels")} title="Choose channel">{channelName}</button>
      <span className={"hh-activity "+b.tone} style={Z.at(59,551,140,561)}>{b.title}{b.sub?" · "+b.sub:""}</span>
      <button type="button" className={"hh-ico hh-scan"+(scanning?" on":"")} style={Z.dot(147,535,12)} onClick={onScan||undefined} disabled={!onScan} title={scanning?"Scan off":"Scan"} aria-label="Scan"><svg viewBox="0 0 12 12"><rect x="1" y="2" width="10" height="3" rx="1.5"/><rect x="1" y="7" width="10" height="3" rx="1.5"/><circle cx={scanning?8.6:3.4} cy="3.5" r="2.2"/><circle cx={scanning?3.4:8.6} cy="8.5" r="2.2"/></svg></button>
      <button type="button" className="hh-ico" style={Z.dot(146.5,555,11)} onClick={f.replayLast} title="Replay last" aria-label="Replay last"><svg viewBox="0 0 12 12"><rect x="1" y="3" width="10" height="8" rx="1.6"/><path d="M4 2.6 5.2 1h1.6L8 2.6" /><path d="M3.6 7.4a2.4 2.4 0 1 0 1-2" fill="none" strokeWidth="1.1"/><path d="M3 4.2v1.8h1.8" fill="none" strokeWidth="1.1"/></svg></button>
    </div>
    <div className="hh-card hh-tabs" style={S.at(51,566,154,587)}>
      <button type="button" onClick={()=>setScreen("zones")}><svg viewBox="0 0 14 11"><path d="M0 1.2Q0 0 1.2 0h3.6l1.4 1.6h6.6Q14 1.6 14 2.8v7Q14 11 12.8 11H1.2Q0 11 0 9.8Z"/></svg>Zone</button>
      <button type="button" onClick={()=>onTab("calls")}><svg viewBox="0 0 16 11"><circle cx="5" cy="2.6" r="2.4"/><circle cx="11" cy="2.6" r="2.4"/><path d="M0 11V8.2Q0 5.8 2.6 5.8h4.8Q10 5.8 10 8.2V11Z"/><path d="M8.6 5.8h4.8Q16 5.8 16 8.2V11h-5.2"/></svg>Contacts</button>
      <button type="button" onClick={()=>setScreen("more")}><svg className="dots" viewBox="0 0 14 4"><circle cx="2" cy="2" r="1.7"/><circle cx="7" cy="2" r="1.7"/><circle cx="12" cy="2" r="1.7"/></svg>More</button>
    </div>
    <div className="hh-card hh-msg" style={S.at(51,589,154,631)}>
      {incoming?<>
        <span className="hh-msg-name call" style={M.at(55,591,152,601)}>Call from {incoming.caller_display_name||incoming.caller_callsign||"Member"}</span>
        <span className="hh-msg-text" style={M.at(55,601.5,152,609)}>Incoming private call</span>
        <div className="hh-msg-btns" style={M.at(51,611,154,631)}><button type="button" className="go" onClick={onAnswer}>Answer</button><button type="button" className="stop" onClick={onDecline}>Decline</button></div>
      </>:call?<>
        <span className="hh-msg-name call" style={M.at(55,591,152,601)}>{callState==="calling"?"Calling…":"Call connected"}</span>
        <span className="hh-msg-text" style={M.at(55,601.5,152,609)}>{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</span>
        <div className="hh-msg-btns" style={M.at(51,611,154,631)}><button type="button" className="stop" onClick={onEndCall}>End Call</button></div>
      </>:<>
        <i className={"hh-check"+(last?"":" off")} style={M.dot(59,597,6)}/>
        <span className="hh-msg-name" style={M.at(66,591,152,601)}>{last?last.name:"No recent traffic"}</span>
        <span className="hh-msg-text" style={M.at(66,601.5,152,609)}>{last?`Heard ${hhmm(last.at)} · ${secs(last.ms)}`:"Transmissions you hear show up here"}</span>
        <div className="hh-msg-btns" style={M.at(51,611,154,631)}>
          <button type="button" onClick={()=>onReplay?.(last?.id)} disabled={!last?.url}><svg viewBox="0 0 12 10"><rect x=".5" y=".5" width="11" height="7.6" rx="1.2"/><path d="M2.5 10V7.6h2.4"/><path d="M3 4.4h3.6M3 2.6h5.6" stroke="#fff" strokeWidth=".9"/><circle cx="9.4" cy="6" r="2.2" stroke="#fff" strokeWidth=".6"/></svg>Replay</button>
          <button type="button" onClick={()=>setScreen("recent")}><svg viewBox="0 0 12 10"><path d="M.5 1.5Q.5.5 1.5.5h9q1 0 1 1v5.6q0 1-1 1H4L1.8 10V8.1H1.5q-1 0-1-1Z"/><path d="M3 2.8h6M3 4.6h6" stroke="#fff" strokeWidth=".9"/></svg>All Recent</button>
        </div>
      </>}
    </div>
    <button type="button" className="hh-card hh-loc" style={S.at(51,634,154,654)} onClick={()=>setScreen("status")} title="My status">
      <svg className="hh-pin" style={L.at(54.2,639,61.8,650.5)} viewBox="0 0 10 14"><path d="M5 0a5 5 0 0 1 5 5c0 3.6-5 9-5 9S0 8.6 0 5a5 5 0 0 1 5-5Z"/><circle cx="5" cy="5" r="2" fill="#fff"/></svg>
      <span className="hh-loc-text" style={L.at(66,637.5,154,654)}><span className={myStatus?statusClass(myStatus):""}>{myStatus?"Status: "+myStatus:"No status set"}</span><span>{callsign||"No callsign"} · {participants.length} on channel</span></span>
    </button>
  </>;
  return <div className="hh-screen" style={{...at(49,474,156,654),filter:"brightness(var(--apx-bright))"}}>
    <div className="hh-statusbar" style={S.at(49,474,156,491)}>
      {f.ledTx?<em className="tx">TX</em>:f.ledRx?<em className="rx">RX</em>:null}
      <span className="hh-batt" style={S.at(127,478.5,133,487.5)}/>
      <span className="hh-time" style={S.at(135,477,155,489)}>{clock(now)}</span>
    </div>
    {body}
  </div>;
}

export function TouchHandheld(p){
  const f=useFace(p);
  const {connected,muted,volume=7,ptt,onMute,onVolume,onPttDown,onPttUp,visibleChannels=[]}=p;
  const [screen,setScreen]=useState("home");
  const home=()=>{setScreen("home");f.goHome()};
  // Mapped "home", "who" and "recent" buttons also drive the touch screen.
  useEffect(()=>{if(f.view==="who"||f.view==="recent")setScreen(f.view)},[f.view]);
  return <div className="hh" style={{"--apx-bright":0.55+f.brightness*0.15,width:205*K,height:768*K}}>
    <Body/>
    <div className="hh-hold" style={at(80,340,126,402)}><Knob className="hh-knob" title="Channel (click or scroll to change)" onClick={()=>f.stepChannel(1)} onStep={f.stepChannel}><ChannelKnob f={f} channels={visibleChannels}/></Knob></div>
    <div className="hh-hold" style={at(157,372,199,404)}><Knob className="hh-knob" title={muted?"Volume (muted, click to unmute)":`Volume ${volume} (scroll to change, click to mute)`} onClick={onMute} onStep={dir=>onVolume?.(-dir)}><VolumeKnob volume={volume} muted={muted}/></Knob></div>
    <div className="hh-badge" style={dot(100,425,26)} title="Repeater Nation">RN</div>
    <i className={"hh-led"+(f.ledTx?" tx":f.ledRx?" rx":f.ledCall?" call":"")} style={at(143.6,430,148.4,437)} title="Transmit / receive light"/>
    <button type="button" className={"hh-ptt"+(ptt?" pressed":"")} style={at(10,478,38,600)} disabled={!connected} title="Push to talk (hold)" aria-label="Side PTT" {...pttHandlers(onPttDown,onPttUp)}/>
    <Screen p={p} f={f} screen={screen} setScreen={setScreen}/>
    <button type="button" className="hh-home" style={at(82.4,671.4,122.8,689.6)} onClick={home} title="Home" aria-label="Home"><i/></button>
    {[0,1,2,3,4,5].map(i=>{const c=[[48.6,81.6],[85.6,118.8],[123.4,156.8]][i%3],r=i<3?[696.6,713.6]:[722.6,739.6];
      return <button type="button" key={i} className={"hh-pkey c"+i%3} style={at(c[0],r[0],c[1],r[1])}
        onClick={i<5?()=>f.oneTouch(i):onMute} title={i<5?(visibleChannels[i]?`P${i+1}: ${visibleChannels[i].name}`:`P${i+1}`):"P6: mute / unmute"}>P{i+1}</button>})}
  </div>;
}
