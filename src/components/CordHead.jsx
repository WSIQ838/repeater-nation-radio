import {useEffect,useState} from "react";
import {photoBoxes,useFace} from "./ControlHead";
import {hhmm,pttHandlers} from "./TouchHandheld";
import {KeyList,useKeypadMenu} from "./KeypadHandheld";

// Handheld control head on a cord, laid out from Sean's photo (913×1600, head at
// x 92–796, y 58–1475, cord boot below). The body is one SVG in the photo's own pixels;
// keys and the screen sit on top at the same photo boxes, scaled by K.
const K=0.55,OX=86,OY=52,W=716,H=1548;
const {at}=photoBoxes(OX,OY,K);
const S=photoBoxes(249,278,K);

// The head's static body in photo pixels: top cover with power button, LEDs and CH
// rocker, name lettering, display bezel, key troughs, textured PTT side and cord boot.
function Body(){
  const top="M110,192 L110,124 Q112,104 132,94 Q162,78 210,71 L676,71 Q726,78 756,94 Q775,104 777,124 L779,192 Z";
  const body="M106,192 L779,192 Q788,193 794,200 Q797,206 796,220 L796,330 Q793,358 778,380 L762,420 Q759.6,432 759.4,460 L758,1240 Q757.4,1300 754,1330 Q748,1372 734,1404 Q718,1436 696,1458 Q682,1472 650,1474 L262,1474 Q228,1472 212,1452 Q190,1428 178,1398 Q166,1366 163,1330 L160,1290 L154,1080 Q152,1056 147,1040 L146,960 Q146,930 140,880 Q130,826 121,800 L121,450 Q118,412 108,380 Q100,360 97,336 L93,240 Q93,214 99,200 Q102,193 106,192 Z";
  return <svg className="cd-body" viewBox={`${OX} ${OY} ${W} ${H}`} aria-hidden="true">
    <defs>
      <linearGradient id="cdBody" x1="92" x2="797" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#3a414c"/><stop offset=".08" stopColor="#2c323c"/><stop offset=".5" stopColor="#2a3039"/><stop offset=".92" stopColor="#2a3039"/><stop offset="1" stopColor="#353c47"/></linearGradient>
      <linearGradient id="cdRim" x1="92" x2="797" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset=".045" stopColor="#c8d4e4" stopOpacity=".16"/><stop offset=".1" stopColor="#fff" stopOpacity="0"/><stop offset=".9" stopColor="#fff" stopOpacity="0"/><stop offset=".95" stopColor="#c8d4e4" stopOpacity=".13"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
      <linearGradient id="cdTop" x1="0" y1="68" x2="0" y2="194" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#59616d"/><stop offset=".3" stopColor="#4a525e"/><stop offset=".36" stopColor="#3e4651"/><stop offset="1" stopColor="#363d48"/></linearGradient>
      <linearGradient id="cdLetters" x1="0" y1="158" x2="0" y2="194" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#e2e9f1"/><stop offset=".55" stopColor="#b9c5d2"/><stop offset="1" stopColor="#8f9cab"/></linearGradient>
      <linearGradient id="cdBoot" x1="320" x2="600" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#1d2329"/><stop offset=".3" stopColor="#2b323a"/><stop offset=".55" stopColor="#323941"/><stop offset="1" stopColor="#1b2127"/></linearGradient>
      <linearGradient id="cdFade" x1="0" y1="1540" x2="0" y2="1600" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
      <mask id="cdBootMask"><rect x="300" y="1440" width="320" height="170" fill="url(#cdFade)"/></mask>
      <radialGradient id="cdPower" cx="258" cy="72" r="70" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#3e4b52"/><stop offset=".7" stopColor="#252d33"/><stop offset="1" stopColor="#14191d"/></radialGradient>
      <linearGradient id="cdRocker" x1="0" y1="58" x2="0" y2="104" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#4d555f"/><stop offset=".5" stopColor="#30373f"/><stop offset="1" stopColor="#1a1f25"/></linearGradient>
      <filter id="cdGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.45"/><feComposite in2="SourceAlpha" operator="in"/></filter>
      <filter id="cdSpeck" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".42" numOctaves="2" seed="17"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 3 -1.85"/><feComposite in2="SourceAlpha" operator="in"/></filter>
    </defs>
    {/* cord boot, fading out where the photo ends */}
    <g mask="url(#cdBootMask)">
      <path d="M318,1462 L602,1462 Q600,1500 592,1516 L572,1600 L348,1600 L328,1516 Q320,1500 318,1462 Z" fill="url(#cdBoot)"/>
      <path d="M328,1518 Q460,1530 592,1518" fill="none" stroke="#11161a" strokeWidth="3"/>
      <path d="M330,1522 Q460,1534 590,1522" fill="none" stroke="#4a525b" strokeOpacity=".5" strokeWidth="1.5"/>
    </g>
    {/* housing */}
    <path d={body} fill="url(#cdBody)" stroke="#0c1014" strokeWidth="2"/>
    <path d={body} fill="#000" filter="url(#cdGrain)" opacity=".7"/>
    <path d={body} fill="#000" filter="url(#cdSpeck)" opacity=".35"/>
    <path d={body} fill="url(#cdRim)"/>
    {/* PTT ridges on the left side */}
    {[440,480,520,560,600,640,680].map(y=><path key={y} d={`M124,${y-14} Q114,${y-12} 114,${y} Q114,${y+12} 124,${y+14}`} fill="#2b313a" stroke="#0e1216" strokeWidth="1.6"/>)}
    <path d="M121,700 Q108,720 110,760 Q112,790 122,804" fill="#2d343d" stroke="#0e1216" strokeWidth="1.6"/>
    <path d="M147,996 Q137,1000 137,1018 Q137,1036 147,1042" fill="#283039" stroke="#0e1216" strokeWidth="1.6"/>
    {/* top cover, lettering and the step where it meets the body */}
    <path d={top} fill="url(#cdTop)" stroke="#0c1014" strokeWidth="2"/>
    <path d={top} fill="#000" filter="url(#cdGrain)" opacity=".55"/>
    {/* power button and CH rocker on the top edge */}
    <ellipse cx="258" cy="86" rx="70" ry="28" fill="#12171b" opacity=".8"/>
    <ellipse cx="258" cy="82" rx="68" ry="24" fill="url(#cdPower)" stroke="#0c1013" strokeWidth="2"/>
    <path d="M206,78 Q220,62 258,61 Q296,62 310,78" fill="none" stroke="#8a98a0" strokeOpacity=".4" strokeWidth="2.2"/>
    <g transform="translate(246 64)" fill="none" stroke="#2fb35a" strokeWidth="3.6" strokeLinecap="round"><path d="M5,3 A8,8 0 1 0 15,3"/><path d="M10,0 L10,9"/></g>
    <rect x="418" y="60" width="274" height="48" rx="24" fill="#12171b"/>
    <ellipse cx="480" cy="80" rx="58" ry="20" fill="url(#cdRocker)" stroke="#0c1013" strokeWidth="2"/>
    <ellipse cx="632" cy="78" rx="56" ry="20" fill="url(#cdRocker)" stroke="#0c1013" strokeWidth="2"/>
    <path d="M440,70 Q458,61 480,61 Q502,61 520,70 M594,68 Q612,59 632,59 Q652,59 670,68" fill="none" stroke="#8a929c" strokeOpacity=".45" strokeWidth="2"/>
    <path d="M466,72 L486,72" stroke="#dfe5ea" strokeWidth="3.4" strokeLinecap="round"/>
    <path d="M616,70 L636,70 M626,60 L626,80" stroke="#dfe5ea" strokeWidth="3.4" strokeLinecap="round"/>
    <text x="560" y="95" textAnchor="middle" fontSize="17" fontWeight="800" fill="#dfe5ea" fontFamily="Arial,Helvetica,sans-serif" letterSpacing="1.5">CH</text>
    <path d="M118,116 Q160,112 300,112 L600,112 Q730,112 770,116" fill="none" stroke="#6d7581" strokeOpacity=".55" strokeWidth="2.4"/>
    {[[333,111],[388,109],[442,109]].map(([x,y],i)=><ellipse key={i} cx={x} cy={y} rx="10" ry="6" fill={i?"#1b2026":"#3a2226"} stroke="#090c0f" strokeWidth="1.4"/>)}
    <path d="M106,193 L780,193" stroke="#0b0e12" strokeWidth="3"/>
    <text x="438.5" y="192" textAnchor="middle" fontSize="39" fontWeight="900" fontStyle="italic" fill="none" stroke="#151a20" strokeWidth="6" strokeLinejoin="round" fontFamily="Arial Black,Arial,Helvetica,sans-serif" textLength="357" lengthAdjust="spacingAndGlyphs">REPEATER NATION</text>
    <text x="438.5" y="192" textAnchor="middle" fontSize="39" fontWeight="900" fontStyle="italic" fill="url(#cdLetters)" stroke="url(#cdLetters)" strokeWidth="2.2" strokeLinejoin="round" fontFamily="Arial Black,Arial,Helvetica,sans-serif" textLength="357" lengthAdjust="spacingAndGlyphs">REPEATER NATION</text>
    {/* display bezel and the microphone slot */}
    <rect x="227" y="264" width="434" height="302" rx="22" fill="#06080b"/>
    <rect x="230" y="267" width="428" height="296" rx="20" fill="none" stroke="#3e4651" strokeOpacity=".7" strokeWidth="2"/>
    <rect x="186" y="566" width="12" height="40" rx="6" fill="#06080b"/>
    {/* key troughs: nav well and the volume row */}
    <rect x="339" y="628" width="214" height="204" rx="34" fill="#0b0e12"/>
    <rect x="233" y="874" width="433" height="110" rx="50" fill="#06090c"/>
    <rect x="353" y="896" width="190" height="66" rx="6" fill="#1b2128"/>
    <path d="M356,960 L540,960" stroke="#454d57" strokeOpacity=".6" strokeWidth="2"/>
  </svg>;
}

const KEYS=[["1",", . ?"],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],["7","PQRS"],["8","TUV"],["9","WXYZ"],["*",""],["0",""],["#",""]];
const KEY_COLS=[[240,351],[394,506],[550,662]],KEY_ROWS=[[1031,1084],[1105,1159],[1180,1232],[1254,1306]];
const keyIcon={
  "*":<svg viewBox="0 0 14 12"><path d="M13 1.5 2 6l11 4.5M6.4 4.4 13 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>,
  "0":<svg viewBox="0 0 12 12"><path d="M6 1 1.2 6.4h3V11h3.6V6.4h3Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  "#":<svg viewBox="0 0 12 14"><path d="M2 1h5v5M1 13h10V7" fill="none" stroke="currentColor" strokeWidth="1.6"/><rect x="4.5" y="4" width="4.5" height="4" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>,
};
const spk=n=><svg viewBox="0 0 20 14"><path d="M1 4.6h3.6L9 1v12L4.6 9.4H1Z" fill="currentColor"/>{n>0&&<path d="M11.6 4.4a3.6 3.6 0 0 1 0 5.2" fill="none" stroke="currentColor" strokeWidth="1.6"/>}{n>1&&<path d="M14 2.2a6.8 6.8 0 0 1 0 9.6" fill="none" stroke="currentColor" strokeWidth="1.6"/>}{n>2&&<path d="M16.4 0.6a9.6 9.6 0 0 1 0 12.8" fill="none" stroke="currentColor" strokeWidth="1.6"/>}</svg>;

// The monochrome screen, laid out like the photo: status icons with the time, a grey
// line (channel number and zone, or what's happening), the channel name and two
// softkeys on the dark blue bar.
function Screen({p,f,ui}){
  const {channelName,zoneName,connected,muted,scanning,visibleChannels=[],channelId}=p;
  const {screen,soft}=ui;
  const b=f.banner,busy=b.tone!=="listen";
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(id)},[]);
  const num=visibleChannels.find(c=>c.id===channelId)?.number??f.channelIndex+1;
  return <div className="cd-screen" style={{...at(249,278,641,548),filter:"brightness(var(--apx-bright))"}}>
    <div className="cd-status" style={S.at(249,279,641,320)}>
      <span className="cd-icons">
        <span className="cd-bars" title={connected?"Signal":"No signal"}><b/>{[1,2,3,4].map(n=><i key={n} className={n<=f.bars?"on":""}/>)}</span>
        <svg className={"cd-si"+(connected?"":" off")} viewBox="0 0 14 14" aria-label="On air"><path d="M1.5 1.5v11M12.5 1.5v11" stroke="#222" strokeWidth="1.8"/><path d="M3.5 7h6M7 4.5 9.6 7 7 9.5" fill="none" stroke="#1f6fd0" strokeWidth="1.9"/></svg>
        {muted&&<svg className="cd-si" viewBox="0 0 14 14" aria-label="Muted"><path d="M1 5h3l4-3.5v11L4 9H1Z" fill="#222"/><path d="M9.5 4.5l4 5m0-5-4 5" stroke="#d93b30" strokeWidth="1.6"/></svg>}
        {scanning&&<em>SCAN</em>}{f.ledTx?<em className="tx">TX</em>:f.ledRx?<em className="rx">RX</em>:null}
      </span>
      <span className="cd-clock">{hhmm(now)}</span>
    </div>
    {screen==="home"?<button type="button" className="cd-main" style={S.at(249,330,641,494)} onClick={ui.openChannels} title="Choose channel">
      {f.entry?<>
        <span className="cd-sub">Channel number · # Enter</span>
        <span className="cd-cname">Ch {f.entry}<u>_</u></span>
      </>:<>
        <span className={"cd-sub"+(busy?" "+b.tone:"")}>{busy?b.title+(b.sub?" · "+b.sub:""):`Ch ${num} · ${zoneName||"All Zones"}`}</span>
        <span className="cd-cname">{channelName}</span>
      </>}
    </button>:<KeyList ui={ui} prefix="cd" style={S.at(252,324,638,494)}/>}
    <div className="cd-soft" style={S.at(249,496,641,548)}>
      {soft.map((k,i)=><button type="button" key={i} className={k.tone||""} onClick={k.act||undefined} disabled={!k.act}>{k.label}</button>)}
    </div>
  </div>;
}

export function CordHead(p){
  const f=useFace(p);
  const {connected,muted,volume=7,ptt,onMute,onVolume,onPttDown,onPttUp,onScan,scanning,onReplay,onTab,onPower,state}=p;
  const ui=useKeypadMenu(p,f,()=>[{label:"P Mon",act:()=>onTab("console")},{label:"Scan",act:onScan||null,tone:scanning?"on":""}]);
  const {screen,okKey,backKey,nav,digit}=ui;
  return <div className="cd" style={{"--apx-bright":0.55+f.brightness*0.15,width:W*K,height:H*K}}>
    <Body/>
    <button type="button" className={"cd-power"+(connected?" on":"")} style={at(190,58,326,106)} onClick={onPower} title={connected?"Power: radio off":"Power: radio on"} aria-label="Power"/>
    <button type="button" className="cd-rock" style={at(420,58,556,104)} onClick={()=>f.stepChannel(-1)} title="CH −: previous channel" aria-label="Channel down"/>
    <button type="button" className="cd-rock" style={at(556,58,690,104)} onClick={()=>f.stepChannel(1)} title="CH +: next channel" aria-label="Channel up"/>
    <i className={"cd-led"+(f.ledTx?" tx":"")} style={at(323,105,343,117)} title="Transmit light"/>
    <i className={"cd-led"+(f.ledRx?" rx":"")} style={at(378,103,398,115)} title="Receive light"/>
    <i className={"cd-led"+(f.ledCall||scanning?" call":"")} style={at(432,103,452,115)} title="Call / scan light"/>
    <button type="button" className={"cd-ptt"+(ptt?" pressed":"")} style={at(100,380,142,810)} disabled={!connected} title="Push to talk (hold)" aria-label="Side PTT" {...pttHandlers(onPttDown,onPttUp)}/>
    <Screen p={p} f={f} ui={ui}/>
    <button type="button" className="cd-key cd-p" style={at(231,664,327,732)} onClick={onScan||undefined} disabled={!onScan} title={scanning?"P1: scan off":"P1: scan"}>P1</button>
    <button type="button" className="cd-key cd-p" style={at(565,663,661,731)} onClick={()=>{if(!onReplay?.())f.setNotice("Nothing to replay yet")}} title="P2: replay last">P2</button>
    <button type="button" className="cd-key cd-ok" style={at(233,760,329,825)} onClick={okKey} title="Menu / OK" aria-label="Menu / OK">
      <svg viewBox="0 0 12 12"><rect x=".6" y=".6" width="4.4" height="4.4" fill="none" stroke="currentColor" strokeWidth="1.2"/><rect x="7" y=".6" width="4.4" height="4.4"/><rect x=".6" y="7" width="4.4" height="4.4" fill="none" stroke="currentColor" strokeWidth="1.2"/><rect x="7" y="7" width="4.4" height="4.4" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>OK</button>
    <button type="button" className="cd-key cd-back" style={at(566,760,661,826)} onClick={backKey} title="Back / Home" aria-label="Back / Home">
      <svg viewBox="0 0 30 13"><path d="M3.5 3.5h5a3.6 3.6 0 0 1 0 7.2H4" fill="none" stroke="currentColor" strokeWidth="1.9"/><path d="M1 3.5 4.6 1v5Z" fill="currentColor"/><path d="M16 6.4 22.5 1 29 6.4h-2v5.6h-3.2V8.5h-2.6V12H18V6.4Z" fill="currentColor"/></svg></button>
    <div className="cd-nav" style={at(344,633,548,827)}>
      {[["up","Up: next channel"],["right","Right: next zone"],["down","Down: previous channel"],["left","Left: previous zone"]].map(([d,t])=>
        <button type="button" key={d} className={d} onClick={()=>nav(d)} title={screen==="home"?t:d==="left"?"Back":d==="right"?"Select":d==="up"?"Up":"Down"} aria-label={d}><i/></button>)}
    </div>
    <button type="button" className="cd-key cd-vol" style={at(254,899,353,958)} onClick={()=>onVolume?.(-1)} title={`Volume down (${volume})`} aria-label="Volume down">{spk(1)}</button>
    <button type="button" className={"cd-bar"+(muted?" muted":"")} style={at(356,898,542,960)} onClick={onMute} title={muted?"Muted (click to unmute)":"Click to mute"} aria-label="Mute"/>
    <button type="button" className="cd-key cd-vol" style={at(545,899,644,958)} onClick={()=>onVolume?.(1)} title={`Volume up (${volume})`} aria-label="Volume up">{spk(3)}</button>
    {KEYS.map(([d,l],i)=>{const c=KEY_COLS[i%3],r=KEY_ROWS[i/3|0];
      return <button type="button" key={d} className="cd-key cd-digit" style={at(c[0],r[0],c[1],r[1])} onClick={()=>digit(d)} aria-label={d}><b>{d}</b><small>{keyIcon[d]||l}</small></button>})}
    <button type="button" className="cd-key cd-p" style={at(305,1328,410,1386)} onClick={()=>ui.go("who")} title="P3: Who's On">P3</button>
    <button type="button" className="cd-key cd-p cd-p4" style={at(498,1328,603,1386)} onClick={()=>ui.go("status","home")} title="P4: My Status">P4</button>
  </div>;
}
