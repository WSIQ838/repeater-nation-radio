import {useEffect,useState} from "react";
import {ChanLine} from "./ChanLine";
import {zoneLabel} from "../lib/labels";
import {Knob,photoBoxes,useFace} from "./ControlHead";
import {Flutes,hhmm,pttHandlers} from "./TouchHandheld";
import {KeyList,useKeypadMenu} from "./KeypadHandheld";

// Compact handheld, laid out from Sean's XPR 7550-style photo (537×522, radio at
// x 186–345, y 8–517). The body is one SVG in the photo's own pixels; knobs, keys and
// the colour screen sit on top at the same photo boxes, scaled by K.
const K=2.4,OX=183,OY=5,W=166,H=516;
const {at}=photoBoxes(OX,OY,K);
const S=photoBoxes(226,334,K);

function VolumeKnob({volume,muted}){
  const turn=(muted?0:volume)*0.3;
  return <svg viewBox="206 184 34 39" className="xp-knob-svg" aria-hidden="true">
    <defs>
      <linearGradient id="xpKnobV" x1="0" x2="1"><stop offset="0" stopColor="#141516"/><stop offset=".25" stopColor="#333436"/><stop offset=".55" stopColor="#4c4d4f"/><stop offset=".85" stopColor="#2c2d2e"/><stop offset="1" stopColor="#131414"/></linearGradient>
      <clipPath id="xpVolClip"><path d="M208.4,222 L208.4,191 Q208.6,185.6 213.6,185.4 L233,185.4 Q238,185.6 238.2,191 L238.4,222 Z"/></clipPath>
    </defs>
    <path d="M208.4,222 L208.4,191 Q208.6,185.6 213.6,185.4 L233,185.4 Q238,185.6 238.2,191 L238.4,222 Z" fill="url(#xpKnobV)" stroke="#0a0b0b" strokeWidth=".6"/>
    <g clipPath="url(#xpVolClip)">
      <Flutes cx={223.4} top={187} bottom={212} rTop={15} rBottom={15.2} n={14} width={2.6} turn={turn}/>
      <path d="M208,212.6 L239,212.6" stroke="#0c0d0d" strokeWidth="1"/>
      <rect x="208" y="213.2" width="31" height="9" fill="#1e1f20"/>
      {[212,218.5,227,233.6].map(x=><rect key={x} x={x} y="214.6" width="2.2" height="3" rx="1" fill="#6e7072" opacity=".8"/>)}
    </g>
    <path d="M210.6,188.6 Q211.6,186.2 214.4,186.2 L232.4,186.2 Q235.2,186.2 236.2,188.6" fill="none" stroke="#8a8c8e" strokeOpacity=".5" strokeWidth=".7"/>
  </svg>;
}
function ChannelKnob({f}){
  const turn=f.channelIndex*Math.PI/8,a=turn-0.6,show=Math.cos(a)>0.15,ix=262+13*Math.sin(a);// white index groove starts left of centre, as in the photo
  return <svg viewBox="244 166 38 57" className="xp-knob-svg" aria-hidden="true">
    <defs>
      <linearGradient id="xpKnobC" x1="0" x2="1"><stop offset="0" stopColor="#151617"/><stop offset=".25" stopColor="#38393b"/><stop offset=".55" stopColor="#58595b"/><stop offset=".85" stopColor="#323335"/><stop offset="1" stopColor="#141516"/></linearGradient>
      <linearGradient id="xpCollar" x1="0" x2="1"><stop offset="0" stopColor="#262728"/><stop offset=".3" stopColor="#a8aaab"/><stop offset=".5" stopColor="#d8d9da"/><stop offset=".72" stopColor="#8a8c8d"/><stop offset="1" stopColor="#2a2b2c"/></linearGradient>
      <clipPath id="xpChanClip"><path d="M249.4,211 L249.4,174 Q249.8,169 254.6,168.8 L270,168.8 Q274.8,169 275.2,174 L275.6,211 Z"/></clipPath>
    </defs>
    <path d="M246,210 L279.6,210 L281,221.6 L244.6,221.6 Z" fill="#1d1e1f"/>
    <path d="M247.4,211.6 L278.2,211.6 L279.4,218.6 L246.2,218.6 Z" fill="url(#xpCollar)"/>
    {[251,257,263,269,275].map(x=><circle key={x} cx={x} cy="215.2" r="1.1" fill="#202122" opacity=".7"/>)}
    <path d="M249.4,211 L249.4,174 Q249.8,169 254.6,168.8 L270,168.8 Q274.8,169 275.2,174 L275.6,211 Z" fill="url(#xpKnobC)" stroke="#0a0b0b" strokeWidth=".6"/>
    <g clipPath="url(#xpChanClip)">
      <Flutes cx={262.5} top={171} bottom={209} rTop={12.4} rBottom={12.8} n={12} width={2.6} turn={turn}/>
      {show&&<rect x={ix-1.6*Math.cos(a)} y="169.6" width={3.2*Math.cos(a)} height="36.4" rx="1.4" fill="#f4f5f6" opacity={0.5+0.5*Math.cos(a)}/>}
    </g>
  </svg>;
}

// The handheld's static body in photo pixels: stubby antenna with its white band, label
// and badge, housing with the name plate, speaker grille, display bezel, side PTT and
// belt clip.
function Body(){
  const housing="M199,221.6 L322,221.6 Q327.6,222 328,227 L328,500 Q327.6,509 322,513.6 Q317,517.6 310,518 L220,518 Q211,517.6 206,512 Q202.6,508 202.4,500 L202,420 Q198,416 197.6,410 L196,404 L196,262 Q190,258 188,252 L186.6,240 Q186.8,226 191,223.4 Q194,221.8 199,221.6 Z";
  const slot=(y,i)=><g key={i}><rect x="221" y={y} width="92" height="16" rx="8" fill="#060707"/><rect x="223.4" y={y+2.4} width="87.2" height="11.2" rx="5.6" fill="url(#xpSlot)"/></g>;
  return <svg className="xp-body" viewBox={`${OX} ${OY} ${W} ${H}`} aria-hidden="true">
    <defs>
      <linearGradient id="xpAnt" x1="286" x2="318" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#2c2a2b"/><stop offset=".22" stopColor="#4a4748"/><stop offset=".5" stopColor="#5a5758"/><stop offset=".8" stopColor="#3c3a3b"/><stop offset="1" stopColor="#262425"/></linearGradient>
      <linearGradient id="xpBand" x1="284" x2="319" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#8e8d8c"/><stop offset=".25" stopColor="#d4d3d2"/><stop offset=".55" stopColor="#e2e1e0"/><stop offset=".85" stopColor="#b5b4b3"/><stop offset="1" stopColor="#868584"/></linearGradient>
      <linearGradient id="xpBody" x1="186" x2="328" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#3c3d3d"/><stop offset=".12" stopColor="#323333"/><stop offset=".5" stopColor="#2c2d2d"/><stop offset=".9" stopColor="#2a2b2b"/><stop offset="1" stopColor="#363737"/></linearGradient>
      <linearGradient id="xpTop" x1="0" y1="221" x2="0" y2="234" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#8a8b8b"/><stop offset=".3" stopColor="#5a5b5b"/><stop offset="1" stopColor="#3a3b3b" stopOpacity="0"/></linearGradient>
      <linearGradient id="xpSlot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2c2d2d"/><stop offset=".5" stopColor="#424343"/><stop offset="1" stopColor="#3a3b3b"/></linearGradient>
      <linearGradient id="xpClip" x1="318" x2="346" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#4a4b4b"/><stop offset=".15" stopColor="#2e2f2f"/><stop offset=".6" stopColor="#2a2b2b"/><stop offset="1" stopColor="#1e1f1f"/></linearGradient>
      <filter id="xpGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 1.5"/><feComposite in2="SourceAlpha" operator="in"/></filter>
    </defs>
    {/* stubby antenna: rounded cap, band label, badge, white band and the darker base */}
    <path d="M287.2,222 L287.2,15 Q287.4,9 293,9 L311,9 Q316.6,9 316.8,15 L317,222 Z" fill="url(#xpAnt)"/>
    <path d="M289.6,12.4 Q291,10 294,10 L310,10 Q313,10 314.4,12.4" fill="none" stroke="#a8a6a5" strokeOpacity=".55" strokeWidth="1.4"/>
    <rect x="287.2" y="153" width="29.8" height="69" fill="#000" opacity=".12"/>
    <text transform="translate(305.6 91) rotate(-90)" fontSize="10" fontWeight="700" fontStyle="italic" fill="#1a1819" stroke="#77757a" strokeWidth=".3" fontFamily="Arial,Helvetica,sans-serif" letterSpacing=".6">UHF</text>
    <circle cx="302" cy="107" r="7.6" fill="#1c1a1b" stroke="#8a8889" strokeWidth="1.1"/>
    <text x="302" y="109.6" textAnchor="middle" fontSize="7" fontWeight="900" fill="#a9a7a8" fontFamily="Arial,Helvetica,sans-serif">RN</text>
    <rect x="285.6" y="134" width="32.8" height="19.4" rx="1.4" fill="url(#xpBand)"/>
    <path d="M285.6,134.6 L318.4,134.6 M285.6,152.8 L318.4,152.8" stroke="#6a6968" strokeWidth=".8"/>
    {/* LED and the orange top button peeking out by the antenna */}
    <rect x="279" y="216.4" width="9" height="5.6" rx="2" fill="#c8823a"/>
    {/* housing */}
    <path d={housing} fill="url(#xpBody)" stroke="#0c0d0d" strokeWidth=".8"/>
    <path d={housing} fill="#000" filter="url(#xpGrain)" opacity=".55"/>
    <path d="M191,223.4 Q194,221.8 199,221.6 L322,221.6 Q327.6,222 328,227 L328,234 L187,234 Q187.6,226 191,223.4 Z" fill="url(#xpTop)"/>
    <path d="M200.6,230 L200.6,412 M318.4,230 L318.4,500" stroke="#0e0f0f" strokeWidth="1"/>
    <path d="M201.6,232 L201.6,410" stroke="#5a5b5b" strokeOpacity=".4" strokeWidth=".5"/>
    {/* name plate: round badge and the radio's name */}
    <circle cx="228.6" cy="241.2" r="7.2" fill="#f4f4f4" stroke="#1a1b1b" strokeWidth=".6"/>
    <text x="228.6" y="244.2" textAnchor="middle" fontSize="7.4" fontWeight="900" fill="#1c1d1d" fontFamily="Arial Black,Arial,Helvetica,sans-serif" letterSpacing="-.3">RN</text>
    <text x="240.8" y="246.6" fontSize="10.4" fontWeight="700" fill="#f2f2f2" stroke="#f2f2f2" strokeWidth=".45" fontFamily="Arial,Helvetica,sans-serif" textLength="67" lengthAdjust="spacingAndGlyphs">REPEATER NATION</text>
    {/* speaker grille */}
    {[258,278.6,299.2].map(slot)}
    {/* display bezel */}
    <rect x="219.4" y="326.4" width="95.4" height="71" rx="4.4" fill="#0b0c0c"/>
    <rect x="220.2" y="327.2" width="93.8" height="69.4" rx="3.8" fill="none" stroke="#3e4040" strokeWidth=".6"/>
    {/* key area: nav well and the shallow troughs between key rows */}
    <rect x="244.6" y="406.4" width="45" height="39.6" rx="9" fill="#141515"/>
    {/* left side: ridged PTT and a button under it */}
    <path d="M196,256 L190.6,256 Q188.6,256.4 188.6,259 L188.6,333 Q188.6,335.6 190.6,336 L196,336 Z" fill="#2a2b2b" stroke="#0c0d0d" strokeWidth=".6"/>
    {Array.from({length:14},(_,i)=><rect key={i} x="188.8" y={259+i*5.4} width="6.6" height="2.2" rx="1" fill="#565757" opacity=".75"/>)}
    <path d="M196.4,338 L194,338 Q192.6,338.4 192.6,340 L192.6,349 Q192.6,350.6 194,351 L196.4,351 Z" fill="#2a2b2b" stroke="#0c0d0d" strokeWidth=".6"/>
    {/* belt clip */}
    <path d="M318.6,348 L318.6,226 Q319,219.6 325,219.4 L339,219.4 Q344.8,219.8 345.2,226 L345.2,334 Q344.8,342 338,346 Q333,349.6 326,350 L320.6,350 Z" fill="url(#xpClip)" stroke="#0b0c0c" strokeWidth=".7"/>
    <path d="M330.8,224 L330.8,343" stroke="#121313" strokeWidth=".9"/>
    <path d="M331.8,224 L331.8,342" stroke="#5c5d5d" strokeOpacity=".5" strokeWidth=".5"/>
    <path d="M321,224 Q326,220.8 340,221" fill="none" stroke="#7a7b7b" strokeOpacity=".6" strokeWidth=".8"/>
  </svg>;
}

const KEYS=[["1",", . ?"],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],["7","PQRS"],["8","TUV"],["9","WXYZ"],["*",""],["0",""],["#",""]];
const KEY_COLS=[[223,246.4],[255,278.4],[287.6,311]],KEY_ROWS=[[447.6,459.8],[463.4,475.6],[478.4,490.6],[493.4,505.6]];
const keyIcon={
  "*":<svg viewBox="0 0 12 10"><path d="M11 1.5 2 5l9 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>,
  "0":<svg viewBox="0 0 10 10"><path d="M5 .8 9.2 5 5 9.2.8 5Z" fill="currentColor"/></svg>,
  "#":<svg viewBox="0 0 11 12"><path d="M2 1h5v5M1 11h9V6.5" fill="none" stroke="currentColor" strokeWidth="1.5"/><rect x="4" y="3.6" width="4" height="3.6" fill="none" stroke="currentColor" strokeWidth="1.3"/></svg>,
};

// The colour screen, laid out like the photo: status icons with the time, a grey line
// (channel number and zone, or what's happening), the channel name in bold and two
// softkeys on the dark blue bar.
function Screen({p,f,ui}){
  const {channelName,zoneName,connected,muted,scanning,visibleChannels=[],channelId}=p;
  const {screen,soft}=ui;
  const b=f.banner,busy=b.tone!=="listen";
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(id)},[]);
  const num=visibleChannels.find(c=>c.id===channelId)?.number??f.channelIndex+1;
  return <div className="xp-screen" style={{...at(226,334,307.6,393.4),filter:"brightness(var(--apx-bright))"}}>
    <div className="xp-status" style={S.at(227,334.6,307,345)}>
      <span className="xp-bars" title={connected?"Signal":"No signal"}>{[1,2,3,4].map(n=><i key={n} className={n<=f.bars?"on":""}/>)}</span>
      <span className="xp-batt" title="Battery"><i/></span>
      <svg className={"xp-si"+(connected?"":" off")} viewBox="0 0 14 14" aria-label="On air"><path d="M1.5 1.5v11M12.5 1.5v11M3.5 7h6M7 4.5 9.6 7 7 9.5" fill="none" stroke="#1f6fb4" strokeWidth="1.9"/></svg>
      {muted&&<svg className="xp-si" viewBox="0 0 14 14" aria-label="Muted"><path d="M1 5h3l4-3.5v11L4 9H1Z" fill="#333"/><path d="M9.5 4.5l4 5m0-5-4 5" stroke="#d93b30" strokeWidth="1.6"/></svg>}
      {scanning&&<em>SCAN</em>}{f.ledTx?<em className="tx">TX</em>:f.ledRx?<em className="rx">RX</em>:null}
      <span className="xp-clock">{hhmm(now)}</span>
    </div>
    {screen==="home"?<button type="button" className="xp-main" style={S.at(226,346,307.6,378.6)} onClick={ui.openChannels} title="Choose channel">
      {f.entry?<>
        <span className="xp-sub">Channel number · # Enter</span>
        <span className="xp-cname">Ch {f.entry}<u>_</u></span>
      </>:<>
        <span className={"xp-sub"+(busy?" "+b.tone:"")}>{busy?b.title+(b.sub?" · "+b.sub:""):zoneLabel(zoneName)}</span>
        <span className="xp-cname"><ChanLine number={num} name={channelName}/></span>
      </>}
    </button>:<KeyList ui={ui} prefix="xp" style={S.at(227,346,306.6,378.6)}/>}
    <div className="xp-soft" style={S.at(226,379,307.6,393.4)}>
      {soft.map((k,i)=><button type="button" key={i} className={k.tone||""} onClick={k.act||undefined} disabled={!k.act}>{k.label}</button>)}
    </div>
  </div>;
}

export function CompactHandheld(p){
  const f=useFace(p);
  const {connected,muted,volume=7,ptt,onMute,onVolume,onPttDown,onPttUp,onScan,scanning,onReplay,onTab}=p;
  const ui=useKeypadMenu(p,f,ui=>[{label:"Contact",act:()=>onTab("calls")},{label:"Zone",act:ui.openZones}]);
  const {screen,okKey,backKey,nav,digit}=ui;
  const led=f.ledTx?" tx":f.ledRx?" rx":f.ledCall?" call":"";
  return <div className="xp" style={{"--apx-bright":0.55+f.brightness*0.15,width:W*K,height:H*K}}>
    <Body/>
    <i className={"xp-led"+led} style={at(237,216.4,249.6,222)} title="Transmit / receive light"/>
    <div className="xp-hold" style={at(206,184,240,223)}><Knob className="xp-knob" title={muted?"Volume (muted, click to unmute)":`Volume ${volume} (scroll to change, click to mute)`} onClick={onMute} onStep={dir=>onVolume?.(-dir)}><VolumeKnob volume={volume} muted={muted}/></Knob></div>
    <div className="xp-hold" style={at(244,166,282,223)}><Knob className="xp-knob" title="Channel (click or scroll to change)" onClick={()=>f.stepChannel(1)} onStep={f.stepChannel}><ChannelKnob f={f}/></Knob></div>
    <button type="button" className={"xp-ptt"+(ptt?" pressed":"")} style={at(185,254,198,338)} disabled={!connected} title="Push to talk (hold)" aria-label="Side PTT" {...pttHandlers(onPttDown,onPttUp)}/>
    <Screen p={p} f={f} ui={ui}/>
    <button type="button" className="xp-key xp-p" style={at(223,407.6,243.4,420.4)} onClick={onScan||undefined} disabled={!onScan} title={scanning?"P1: scan off":"P1: scan"}>P1</button>
    <button type="button" className="xp-key xp-p" style={at(290.6,407.6,311,420.4)} onClick={()=>{if(!onReplay?.())f.setNotice("Nothing to replay yet")}} title="P2: replay last">P2</button>
    <button type="button" className="xp-key xp-ok" style={at(223,424.4,243.4,444.4)} onClick={okKey} title="Menu / OK" aria-label="Menu / OK">
      <svg viewBox="0 0 12 12"><rect x=".6" y=".6" width="4.4" height="4.4" fill="none" stroke="currentColor" strokeWidth="1.2"/><rect x="7" y=".6" width="4.4" height="4.4"/><rect x=".6" y="7" width="4.4" height="4.4" fill="none" stroke="currentColor" strokeWidth="1.2"/><rect x="7" y="7" width="4.4" height="4.4" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg><b>OK</b></button>
    <button type="button" className="xp-key xp-back" style={at(290.6,424.4,311,444.4)} onClick={backKey} title="Back / Home" aria-label="Back / Home">
      <svg viewBox="0 0 12 9"><path d="M3.4 2h4.4a3 3 0 0 1 0 6H3.6" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M.6 2 3.8 0v4Z" fill="currentColor"/></svg>
      <svg viewBox="0 0 12 10"><path d="M6 .4 11.6 5H9.8v4.6H7.2V6.8H4.8v2.8H2.2V5H.4Z" fill="currentColor"/></svg></button>
    <div className="xp-nav" style={at(246,408,288.6,444.4)}>
      {[["up","Up: next channel"],["right","Right: next zone"],["down","Down: previous channel"],["left","Left: previous zone"]].map(([d,t])=>
        <button type="button" key={d} className={d} onClick={()=>nav(d)} title={screen==="home"?t:d==="left"?"Back":d==="right"?"Select":d==="up"?"Up":"Down"} aria-label={d}><i/></button>)}
    </div>
    {KEYS.map(([d,l],i)=>{const c=KEY_COLS[i%3],r=KEY_ROWS[i/3|0];
      return <button type="button" key={d} className="xp-key xp-digit" style={at(c[0],r[0],c[1],r[1])} onClick={()=>digit(d)} aria-label={d}><b>{d}</b><small>{keyIcon[d]||l}</small></button>})}
  </div>;
}
