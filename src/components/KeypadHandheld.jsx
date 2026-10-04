import {useEffect,useState} from "react";
import {ChanLine} from "./ChanLine";
import {zoneLabel} from "../lib/labels";
import {Knob,photoBoxes,useFace} from "./ControlHead";
import {Flutes,clock,hhmm,pttHandlers,secs} from "./TouchHandheld";
import {STATUSES,statusClass} from "../lib/status";

// Keypad handheld, laid out from Sean's R7 photo (1100×1100, radio at x 371–713,
// y 13–1068). The body is one SVG in the photo's own pixels; knobs, keys and the
// colour screen sit on top at the same photo boxes, scaled by K.
const K=1.1,OX=360,OY=8,W=365,H=1080;
const {at}=photoBoxes(OX,OY,K);
const D=photoBoxes(440,451,K),ZC=photoBoxes(447.7,511,K),MC=photoBoxes(447.7,622,K);
const day=t=>new Date(t).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});

// Where a fluted knob's white index line sits for a given turn, or null when it has
// rotated round the back.
const indexAt=(cx,r,turn)=>Math.cos(turn)>0.15?{x:cx+r*Math.sin(turn),w:Math.cos(turn)}:null;

function VolumeKnob({volume,muted}){
  const turn=(muted?5:5-volume)*0.33,ix=indexAt(441.5,30,turn);// turning up moves the index line left, as on the real knob
  return <svg viewBox="398 266 86 88" className="kh-knob-svg" aria-hidden="true">
    <defs>
      <linearGradient id="khKnobV" x1="0" x2="1"><stop offset="0" stopColor="#1d1f21"/><stop offset=".22" stopColor="#3c3e40"/><stop offset=".55" stopColor="#77797b"/><stop offset=".8" stopColor="#4a4c4e"/><stop offset="1" stopColor="#1a1b1d"/></linearGradient>
      <clipPath id="khVolClip"><path d="M404.6,291 Q405,272.4 425,272.2 L458,272.2 Q478,272.4 478.4,291 L479.2,334 L403.8,334 Z"/></clipPath>
    </defs>
    <path d="M400.4,345 L482.6,345 L482,353 L401,353 Z" fill="#2b2d2f"/>
    <path d="M403.2,333 L479.8,333 L480.6,346 L402.4,346 Z" fill="#17181a"/>
    <path d="M403.6,334.2 L479.4,334.2" stroke="#55575a" strokeWidth="1"/>
    <path d="M404.6,291 Q405,272.4 425,272.2 L458,272.2 Q478,272.4 478.4,291 L479.2,334 L403.8,334 Z" fill="url(#khKnobV)"/>
    <g clipPath="url(#khVolClip)">
      <Flutes cx={441.5} top={279} bottom={330} rTop={34} rBottom={35} n={12} width={6.5} turn={turn+Math.PI/12}/>
      {ix&&<rect x={ix.x-3.2*ix.w} y="276" width={6.4*ix.w} height="26" rx={3*ix.w} fill="#e9eaeb" opacity={0.55+0.45*ix.w}/>}
    </g>
    <path d="M407,284 Q410,274.5 425,274.2 L458,274.2" fill="none" stroke="#9a9c9e" strokeOpacity=".45" strokeWidth="1.2"/>
  </svg>;
}
function ChannelKnob({f}){
  const turn=f.channelIndex*Math.PI/8,ix=indexAt(535,25,turn);
  return <svg viewBox="494 228 82 126" className="kh-knob-svg" aria-hidden="true">
    <defs>
      <linearGradient id="khKnobC" x1="0" x2="1"><stop offset="0" stopColor="#1b1c1e"/><stop offset=".25" stopColor="#3e4042"/><stop offset=".55" stopColor="#77797b"/><stop offset=".82" stopColor="#3c3e40"/><stop offset="1" stopColor="#18191b"/></linearGradient>
      <linearGradient id="khCollar" x1="0" x2="1"><stop offset="0" stopColor="#1c1d1f"/><stop offset=".5" stopColor="#56585a"/><stop offset="1" stopColor="#1e2022"/></linearGradient>
      <clipPath id="khChanClip"><path d="M507.4,253 Q508,231.4 535,231 Q562,231.4 562.6,253 L564.6,331 L505.4,331 Z"/></clipPath>
    </defs>
    <path d="M504,329 L566,329 L575,347.5 L495,347.5 Z" fill="url(#khCollar)"/>
    {[507,522.5,538,553,566.5].map((x,i)=><circle key={i} cx={x} cy={340.5} r={i===0||i===4?1.7:2.4} fill="#e6e7e8" opacity={i===0||i===4?.6:.95}/>)}
    <path d="M495,347 L575,347 L575,353 L495,353 Z" fill="#2a2c2e"/>
    <path d="M507.4,253 Q508,231.4 535,231 Q562,231.4 562.6,253 L564.6,331 L505.4,331 Z" fill="url(#khKnobC)"/>
    <g clipPath="url(#khChanClip)">
      <Flutes cx={535} top={244} bottom={326} rTop={27} rBottom={29.5} n={12} width={6} turn={turn+Math.PI/12}/>
      {ix&&<rect x={ix.x-5*ix.w} y="240" width={10*ix.w} height="62" rx={5*ix.w} fill="#d7d8d9" opacity={0.5+0.5*ix.w}/>}
    </g>
  </svg>;
}

// The handheld's static body in photo pixels: antenna with its two rings, housing with
// side PTT and buttons, textured name plate, glass, key well and speaker slots.
function Body(){
  const slot=y=><g key={y}><rect x="449" y={y} width="182" height="8" rx="4" fill="#0d0e0f"/>
    {Array.from({length:25},(_,i)=><circle key={i} cx={456+i*7} cy={y+4} r="1.5" fill="#000" stroke="#3a3c3e" strokeWidth=".5"/>)}</g>;
  return <svg className="kh-body" viewBox={`${OX} ${OY} ${W} ${H}`} aria-hidden="true">
    <defs>
      <linearGradient id="khAnt" x1="590" x2="658" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#5e5e60"/><stop offset=".1" stopColor="#3c3c3e"/><stop offset=".2" stopColor="#323436"/><stop offset=".42" stopColor="#57595b"/><stop offset=".6" stopColor="#737577"/><stop offset=".78" stopColor="#555759"/><stop offset=".92" stopColor="#4a4c4e"/><stop offset="1" stopColor="#636567"/></linearGradient>
      <linearGradient id="khBody" x1="371" x2="713" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#45474a"/><stop offset=".07" stopColor="#3a3c3e"/><stop offset=".5" stopColor="#36383a"/><stop offset=".93" stopColor="#3a3c3e"/><stop offset="1" stopColor="#47494b"/></linearGradient>
      <linearGradient id="khPlate" x1="0" y1="360" x2="0" y2="433" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#7a7c7e"/><stop offset=".5" stopColor="#67696b"/><stop offset="1" stopColor="#55575a"/></linearGradient>
      <linearGradient id="khTop" x1="0" y1="352" x2="0" y2="363" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#8a8c8e"/><stop offset=".45" stopColor="#6a6c6e"/><stop offset="1" stopColor="#3a3c3e" stopOpacity="0"/></linearGradient>
      <linearGradient id="khGlass" x1="0" y1="432" x2="0" y2="752" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#353739"/><stop offset="1" stopColor="#212325"/></linearGradient>
      <pattern id="khGrain" width="3.4" height="3.4" patternUnits="userSpaceOnUse"><circle cx=".9" cy="1" r=".75" fill="#000" opacity=".28"/><circle cx="2.5" cy="2.4" r=".65" fill="#fff" opacity=".12"/><circle cx="2.6" cy=".6" r=".4" fill="#000" opacity=".2"/></pattern>
      <pattern id="khTex" width="2.6" height="2.6" patternUnits="userSpaceOnUse"><circle cx="1.3" cy="1.3" r=".55" fill="#000" opacity=".25"/></pattern>
      <linearGradient id="khSilver" x1="0" y1="387" x2="0" y2="403" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#f4f5f6"/><stop offset=".5" stopColor="#b9bbbd"/><stop offset=".55" stopColor="#8e9092"/><stop offset="1" stopColor="#d9dadb"/></linearGradient>
    </defs>
    {/* antenna */}
    <path d="M591,30 Q591,13 607,13 L641,13 Q657,13 657,30 L658,352 L590,352 Z" fill="url(#khAnt)"/>
    <path d="M596,15.5 Q600,13.4 607,13.4 L641,13.4 Q648,13.4 652,15.5" fill="none" stroke="#8a8c8e" strokeOpacity=".5" strokeWidth="1.2"/>
    <rect x="589.4" y="186" width="69.2" height="17" fill="url(#khAnt)"/>
    {[176,201].map(y=><g key={y}><rect x="588.4" y={y} width="71.2" height="12" rx="5" fill="#0f1011"/><rect x="589.6" y={y+1} width="68.8" height="2.2" rx="1.1" fill="#5b5d5f" opacity=".75"/><rect x="589.6" y={y+8.4} width="68.8" height="1.6" rx=".8" fill="#2c2e30"/></g>)}
    <rect x="590" y="213" width="68" height="139" fill="#000" opacity=".2"/>
    <rect x="590" y="326" width="68" height="3.4" fill="#141516"/>
    <circle cx="622.5" cy="270" r="25.5" fill="#2b2d2f" stroke="#1a1b1c" strokeWidth="1.6"/>
    <text x="622.5" y="279" textAnchor="middle" fontSize="25" fontWeight="900" fill="#1a1b1c" fontFamily="Arial,Helvetica,sans-serif">RN</text>
    {/* housing */}
    <path d="M398,352 L672,352 Q700,354 707,380 L712,402 Q713.5,425 708,445 L702,480 L701,660 Q704,690 698,720 L690,742 L690,1020 Q688,1063 660,1068 L425,1068 Q395,1063 393,1020 L392,822 Q384,817 383,800 L382,706 Q375,692 375,662 L376,500 Q371,482 372,460 L376,422 Q370,402 372,390 L378,372 Q384,355 398,352 Z" fill="url(#khBody)" stroke="#121314" strokeWidth="1"/>
    <path d="M398,352 L672,352 Q700,354 707,380 L712,402 Q713.5,425 708,445 L702,480 L701,660 Q704,690 698,720 L690,742 L690,1020 Q688,1063 660,1068 L425,1068 Q395,1063 393,1020 L392,822 Q384,817 383,800 L382,706 Q375,692 375,662 L376,500 Q371,482 372,460 L376,422 Q370,402 372,390 L378,372 Q384,355 398,352 Z" fill="url(#khTex)"/>
    <path d="M392,357 Q396,352.4 404,352.2 L672,352.2 Q690,353 698,361 L392,361 Z" fill="url(#khTop)"/>
    {/* small light window between the knobs */}
    <rect x="482" y="345" width="30" height="10" rx="3" fill="#2a2c2e"/>
    {/* left side: PTT and two buttons; right side button */}
    <path d="M371.5,446 Q370,444 373,441 L385,440 L386,700 L373,700 Q370,697 371.5,694 Z" fill="#37393b" stroke="#1a1b1c" strokeWidth=".8"/>
    {Array.from({length:11},(_,i)=><rect key={i} x="373" y={470+i*20} width="10" height="2.2" rx="1" fill="#25272a"/>)}
    <rect x="374.5" y="712" width="10" height="34" rx="4" fill="#323436" stroke="#1a1b1c" strokeWidth=".8"/>
    <rect x="375.5" y="755" width="10" height="34" rx="4" fill="#323436" stroke="#1a1b1c" strokeWidth=".8"/>
    <rect x="699.5" y="640" width="7" height="58" rx="3" fill="#323436" stroke="#1a1b1c" strokeWidth=".8"/>
    {/* name plate, glass and display well */}
    <path d="M432,372 Q432,360 444,360 L644,360 Q656,360 656,372 L656,433 L432,433 Z" fill="url(#khPlate)"/>
    <path d="M432,372 Q432,360 444,360 L644,360 Q656,360 656,372 L656,433 L432,433 Z" fill="url(#khGrain)"/>
    <path d="M432,372 Q432,360 444,360 L644,360 Q656,360 656,372" fill="none" stroke="#1d1f21" strokeWidth="1.4"/>
    <text x="544" y="402.4" textAnchor="middle" fontSize="17" fontWeight="900" fontStyle="italic" fill="url(#khSilver)" stroke="#161718" strokeWidth="1.5" paintOrder="stroke" fontFamily="Arial Black,Arial,Helvetica,sans-serif" textLength="172" lengthAdjust="spacingAndGlyphs">REPEATER NATION</text>
    <path d="M428,433 L660,433 L660,738 Q660,752 646,752 L442,752 Q428,752 428,738 Z" fill="url(#khGlass)"/>
    <rect x="438.6" y="449.6" width="205.8" height="272.8" rx="2" fill="#0b0c0d"/>
    {/* key well with speaker slots between the digit rows */}
    <path d="M425,772 Q425,758 439,758 L646,758 Q660,758 660,772 L660,1042 Q660,1056 646,1056 L439,1056 Q425,1056 425,1042 Z" fill="#161718"/>
    <path d="M427,772 Q427,760 439,760 L646,760 Q658,760 658,772" fill="none" stroke="#6e7072" strokeWidth="1.6" strokeOpacity=".8"/>
    {[894.5,944.5,994.5].map(slot)}
  </svg>;
}

const keyIcon={
  "*":<svg viewBox="0 0 16 12"><path d="M14 2 3 6l11 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>,
  "0":<svg viewBox="0 0 12 12"><path d="M6 1 1.5 6h2.8v5h3.4V6h2.8Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  "#":<svg viewBox="0 0 12 14"><path d="M2 1h5v5M1 13h10V7" fill="none" stroke="currentColor" strokeWidth="1.4"/><rect x="4.5" y="4" width="4.5" height="4" fill="none" stroke="currentColor" strokeWidth="1.3"/></svg>,
};
const KEYS=[["1",", . ?"],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],["7","PQRS"],["8","TUV"],["9","WXYZ"],["*",""],["0",""],["#",""]];
const KEY_COLS=[[431,500],[504,581],[585,654]],KEY_ROWS=[[859,891.5],[909,941.5],[959,991.5],[1009,1042]];

// The colour screen: status icons, date and time, zone/channel card, last-heard card and
// two on-screen softkeys. Menu lists are worked with the nav pad, OK and Back.
function Screen({p,f,ui}){
  const {channelName,channelNumber,zoneName,connected,muted,participants=[],lastHeard=[],scanning,incoming,call,callState}=p;
  const {screen,soft}=ui;
  const b=f.banner,last=lastHeard[0];
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(id)},[]);
  return <div className="kh-screen" style={{...at(440,451,643,721),filter:"brightness(var(--apx-bright))"}}>
    <div className="kh-status" style={D.at(440,451,643,476)}>
      <span className="kh-bars" title={connected?"Signal":"No signal"}><b/>{[1,2,3,4].map(n=><i key={n} className={n<=f.bars?"on":""}/>)}</span>
      <svg className="kh-si" viewBox="0 0 12 14" aria-label="Zone"><path d="M1.5 2h9L2 12h9" fill="none" stroke="currentColor" strokeWidth="2.2"/><path d="M8 6.5 11 3.5" stroke="currentColor" strokeWidth="1.6"/></svg>
      <svg className={"kh-si"+(connected?"":" off")} viewBox="0 0 14 14" aria-label="On air"><path d="M1.5 1.5v11M12.5 1.5v11M3.5 7h6M7 4.5 9.6 7 7 9.5" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>
      <svg className="kh-si" viewBox="0 0 14 14" aria-label={muted?"Muted":"Sound on"}><path d="M7 1.2c-2.6 0-4 2-4 4.4v3L1.6 10.4h10.8L11 8.6v-3c0-2.4-1.4-4.4-4-4.4ZM5.5 11.6a1.5 1.5 0 0 0 3 0" fill="currentColor"/>{muted&&<path d="M1.5 1.5 12.5 12.5" stroke="#3c3c3c" strokeWidth="3"/>}{muted&&<path d="M1.5 1.5 12.5 12.5" stroke="#ff5a4f" strokeWidth="1.5"/>}</svg>
      {scanning&&<em>SCAN</em>}{f.ledTx?<em className="tx">TX</em>:f.ledRx?<em className="rx">RX</em>:null}
      <span className="kh-batt" style={D.at(628.5,455,641,473)}><i/></span>
    </div>
    <div className="kh-date" style={D.at(447,484,637,504)}><span>{day(now)}</span><span>{clock(now)}</span></div>
    {screen==="home"?<>
      <button type="button" className="kh-card kh-zone" style={D.at(447.7,511,636.5,613.5)} onClick={ui.openChannels} title="Choose channel">
        <i className={"kh-strip "+b.tone} style={ZC.at(447.7,511,463,613.5)}/>
        {f.entry?<>
          <span className="kh-zname" style={ZC.at(474,526,632,548)}>Channel number</span>
          <span className="kh-cname" style={ZC.at(474,551,632,576)}>CH {f.entry}<u>_</u></span>
          <span className={"kh-act"} style={ZC.at(474,585,632,602)}># Enter · * Clear</span>
        </>:<>
          <span className="kh-zname" style={ZC.at(474,526,632,548)}><span className="lbl">{zoneLabel(zoneName)}</span></span>
          <span className="kh-cname" style={ZC.at(474,551,632,576)}><ChanLine number={channelNumber} name={channelName}/></span>
          <span className={"kh-act "+b.tone} style={ZC.at(474,585,632,602)}>{b.title}{b.sub?" · "+b.sub:""}</span>
        </>}
      </button>
      <button type="button" className="kh-card kh-msg" style={D.at(447.7,622,636.5,688)} onClick={incoming||call?undefined:ui.openRecent} title={incoming||call?undefined:"Recent"}>
        <svg className="kh-msgicon" style={MC.at(456,631,472,646)} viewBox="0 0 16 15"><path d="M0 1Q0 0 1 0h14q1 0 1 1v9q0 1-1 1H5l-3.4 3.4V11H1q-1 0-1-1Z"/><path d="M3 3.2h10M3 5.6h10M3 8h7" stroke="#fff" strokeWidth="1.2"/></svg>
        {incoming?<>
          <span className="kh-mtitle call" style={MC.at(480,630,615,648)}>Call</span>
          <span className="kh-mname" style={MC.at(480,649,632,666)}>{incoming.caller_display_name||incoming.caller_callsign||"Member"}</span>
          <span className="kh-mtime" style={MC.at(560,667,634,683)}>OK answers</span>
        </>:call?<>
          <span className="kh-mtitle call" style={MC.at(480,630,615,648)}>{callState==="calling"?"Calling…":callState==="reconnecting"?"Reconnecting…":"Call connected"}</span>
          <span className="kh-mname" style={MC.at(480,649,632,666)}>{call.recipient_display_name||call.recipient_callsign||call.caller_display_name||"Member"}</span>
        </>:<>
          <span className="kh-mtitle" style={MC.at(480,630,605,648)}>Last heard</span>
          <span className="kh-mname" style={MC.at(480,649,632,666)}>{last?last.name:"Nothing yet"}</span>
          {lastHeard.length>0&&<b className="kh-badge" style={MC.at(611.5,630,626.5,645)}>{Math.min(9,lastHeard.length)}</b>}
          {last&&<span className="kh-mtime" style={MC.at(540,667,634,683)} title={secs(last.ms)}>{clock(last.at)}</span>}
        </>}
      </button>
    </>:<KeyList ui={ui} prefix="kh" style={D.at(444,507,639,692)}/>}
    <div className="kh-soft" style={D.at(440,695,643,721)}>
      {soft.map((k,i)=><button type="button" key={i} className={k.tone||""} onClick={k.act||undefined} disabled={!k.act}>{k.label}</button>)}
    </div>
  </div>;
}

// A menu list worked with the nav pad: title, items with the highlight, or an empty note.
export function KeyList({ui,prefix,style}){
  const {list,sel}=ui;
  return <div className={prefix+"-list"} style={style}>
    <strong>{list.title}</strong>
    <div className={prefix+"-items"}>{list.items.length?list.items.map((x,i)=><button type="button" key={i} className={prefix+"-item"+(i===sel?" sel":"")+(x.on?" on":"")+(x.cls?" "+x.cls:"")} onClick={()=>ui.pick(i)} disabled={x.disabled}>
      <span>{x.label}</span>{x.sub&&<small>{x.sub}</small>}</button>):<div className={prefix+"-dim"}>{list.empty}</div>}</div>
  </div>;
}

// Screens, menu lists, nav pad, OK/Back and keypad entry shared by the keypad radios.
// homeSoft(ui) gives the face's own home-screen softkeys; slots is how many it has.
export function useKeypadMenu(p,f,homeSoft,slots=2){
  const {connected,scanning,onScan,onReplay,zones=[],zoneId,visibleChannels=[],channelId,onZone,onChannel,
    participants=[],lastHeard=[],myStatus="",onStatus,onPower,state,onTab,incoming,call,onAnswer,onDecline,onEndCall}=p;
  const [screen,setScreen]=useState("home"),[sel,setSel]=useState(0),[parent,setParent]=useState("home");
  const go=(s,from="home",start=0)=>{setScreen(s);setParent(from);setSel(start)};
  const home=()=>{setScreen("home");setSel(0)};
  const zoneAt=()=>Math.max(0,zones.findIndex(z=>z.id===zoneId));
  const who=x=>{let info={};try{info=x.metadata?JSON.parse(x.metadata):{}}catch{}return info.callsign||info.displayName||x.name||x.identity};
  const lists={
    menu:{title:"Menu",items:[
      {label:"Zones",act:()=>go("zones","menu",zoneAt())},
      {label:"Channels",act:()=>go("channels","menu",f.channelIndex)},
      {label:scanning?"Scan Off":"Scan",act:onScan,disabled:!onScan},
      {label:"Who's On",sub:String(participants.length),act:()=>go("who","menu")},
      {label:"Recent",act:()=>go("recent","menu")},
      {label:"My Status",sub:myStatus||"None",act:()=>go("status","menu",Math.max(0,STATUSES.indexOf(myStatus)))},
      {label:"Brightness",sub:String(f.brightness+1),act:()=>f.setBrightness(x=>x>0?x-1:3)},
      {label:connected||state==="connecting"||state==="reconnecting"?"Radio Off":"Radio On",act:()=>{onPower?.();home()}},
      {label:"Setup",act:()=>onTab("settings")},
    ]},
    zones:{title:"Zones",empty:"No zones",items:zones.map(z=>({label:z.name,on:z.id===zoneId,act:()=>{onZone?.(z.id);home()}}))},
    channels:{title:p.zoneName||"Channels",empty:"No channels",items:visibleChannels.map(c=>({label:c.name,sub:"CH "+c.number,on:c.id===channelId,act:()=>{onChannel?.(c.id);home()}}))},
    who:{title:"Who's On",empty:connected?"Nobody else on channel":"Not connected",items:participants.map(x=>({label:who(x),sub:x.attributes?.status||"",act:null}))},
    recent:{title:"Recent",empty:"Nothing heard yet",items:lastHeard.slice(0,8).map(x=>({label:x.name,sub:hhmm(x.at)+" · "+secs(x.ms),act:x.url?()=>onReplay?.(x.id):null}))},
    status:{title:"My Status",items:STATUSES.map(s=>({label:s,on:s===myStatus,cls:statusClass(s),act:()=>{onStatus?.(s===myStatus?"":s);home()}}))},
  };
  const list=lists[screen]||{title:"",items:[]};
  const n=list.items.length;
  const pick=i=>{const it=list.items[i];setSel(i);if(it?.act&&!it.disabled)it.act()};
  const back=()=>screen==="home"?f.goHome():parent==="menu"&&screen!=="menu"?go("menu","home",0):home();
  const okKey=()=>{if(incoming)return onAnswer?.();if(f.entry)return f.pressKey("#");if(screen==="home")return go("menu");pick(sel)};
  const backKey=()=>{if(incoming)return onDecline?.();if(call)return onEndCall?.();if(f.entry)return f.pressKey("*");back()};
  const nav=dir=>{
    if(screen!=="home"){
      if(dir==="up"||dir==="down"){if(n)setSel(i=>(i+(dir==="down"?1:-1)+n)%n)}
      else if(dir==="left")back();else pick(sel);
      return;
    }
    if(dir==="up")f.stepChannel(1);else if(dir==="down")f.stepChannel(-1);else f.stepZone(dir==="right"?1:-1);
  };
  const digit=d=>{if(screen!=="home")home();f.pressKey(d)};
  const ui={screen,list,sel,n,go,home,back,pick,okKey,backKey,nav,digit,
    openZones:()=>go("zones","home",zoneAt()),openChannels:()=>go("channels","home",f.channelIndex),openRecent:()=>go("recent")};
  // Two softkeys put the pair at each end; three leave the middle one blank.
  const fit=a=>slots===3?[a[0],{label:"",act:null},a[1]]:a;
  ui.soft=incoming?fit([{label:"Answer",act:onAnswer,tone:"go"},{label:"Decline",act:onDecline,tone:"stop"}])
    :call?fit([{label:"End Call",act:onEndCall,tone:"stop"},{label:"",act:null}])
    :f.entry?fit([{label:"Clear",act:()=>f.pressKey("*")},{label:"Enter",act:()=>f.pressKey("#")}])
    :screen!=="home"?fit([{label:"Back",act:back},{label:"Select",act:n?()=>pick(sel):null}])
    :homeSoft(ui);
  // Mapped "who" and "recent" buttons open the matching list; "home" returns home.
  useEffect(()=>{if(f.view==="who"||f.view==="recent")go(f.view);else if(f.view==="home"&&screen!=="home"&&screen!=="menu")home()},[f.view]);
  return ui;
}

export function KeypadHandheld(p){
  const f=useFace(p);
  const {connected,muted,volume=7,ptt,onMute,onVolume,onPttDown,onPttUp,onScan,scanning,onReplay,onTab}=p;
  const ui=useKeypadMenu(p,f,ui=>[{label:"Zones",act:ui.openZones},{label:"Contacts",act:()=>onTab("calls")}]);
  const {screen,okKey,backKey,nav,digit}=ui;
  const led=f.ledTx?" tx":f.ledRx?" rx":f.ledCall?" call":"";
  return <div className="kh" style={{"--apx-bright":0.55+f.brightness*0.15,width:W*K,height:H*K}}>
    <Body/>
    <i className={"kh-led"+led} style={at(483.5,346,510.5,354)} title="Transmit / receive light"/>
    <div className="kh-hold" style={at(398,266,484,354)}><Knob className="kh-knob" title={muted?"Volume (muted, click to unmute)":`Volume ${volume} (scroll to change, click to mute)`} onClick={onMute} onStep={dir=>onVolume?.(-dir)}><VolumeKnob volume={volume} muted={muted}/></Knob></div>
    <div className="kh-hold" style={at(494,228,576,354)}><Knob className="kh-knob" title="Channel (click or scroll to change)" onClick={()=>f.stepChannel(1)} onStep={f.stepChannel}><ChannelKnob f={f}/></Knob></div>
    <button type="button" className={"kh-ptt"+(ptt?" pressed":"")} style={at(364,440,392,702)} disabled={!connected} title="Push to talk (hold)" aria-label="Side PTT" {...pttHandlers(onPttDown,onPttUp)}/>
    <Screen p={p} f={f} ui={ui}/>
    <button type="button" className="kh-key kh-p" style={at(431,765,485,811)} onClick={onScan||undefined} disabled={!onScan} title={scanning?"P1: scan off":"P1: scan"}>P1</button>
    <button type="button" className="kh-key kh-p" style={at(599,765,654,811)} onClick={()=>{if(!onReplay?.())f.setNotice("Nothing to replay yet")}} title="P2: replay last">P2</button>
    <button type="button" className="kh-key kh-ok" style={at(431,815,485,850)} onClick={okKey} title="Menu / OK" aria-label="Menu / OK">
      <svg viewBox="0 0 12 12"><rect x=".5" y=".5" width="4.6" height="4.6" fill="none" stroke="currentColor" strokeWidth="1.1"/><rect x="6.9" y=".5" width="4.6" height="4.6"/><rect x=".5" y="6.9" width="4.6" height="4.6" fill="none" stroke="currentColor" strokeWidth="1.1"/><rect x="6.9" y="6.9" width="4.6" height="4.6" fill="none" stroke="currentColor" strokeWidth="1.1"/></svg>OK</button>
    <button type="button" className="kh-key kh-back" style={at(599,815,654,850)} onClick={backKey} title="Back / Home" aria-label="Back / Home">
      <svg viewBox="0 0 30 13"><path d="M3.5 3.5h5a3.6 3.6 0 0 1 0 7.2H4" fill="none" stroke="currentColor" strokeWidth="1.9"/><path d="M1 3.5 4.6 1v5Z" fill="currentColor"/><path d="M16 6.4 22.5 1 29 6.4h-2v5.6h-3.2V8.5h-2.6V12H18V6.4Z" fill="currentColor"/></svg></button>
    <div className="kh-nav" style={at(487.5,765,596,850)}>
      {[["up","Up: next channel"],["right","Right: next zone"],["down","Down: previous channel"],["left","Left: previous zone"]].map(([d,t])=>
        <button type="button" key={d} className={d} onClick={()=>nav(d)} title={screen==="home"?t:d==="left"?"Back":d==="right"?"Select":d==="up"?"Up":"Down"} aria-label={d}><i/></button>)}
    </div>
    {KEYS.map(([d,l],i)=>{const c=KEY_COLS[i%3],r=KEY_ROWS[i/3|0];
      return <button type="button" key={d} className="kh-key kh-digit" style={at(c[0],r[0],c[1],r[1])} onClick={()=>digit(d)} aria-label={d}><b>{d}</b><small>{keyIcon[d]||l}</small></button>})}
  </div>;
}
