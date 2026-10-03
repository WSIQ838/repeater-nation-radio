import {useEffect,useState} from "react";
import {Knob,photoBoxes,useFace} from "./ControlHead";
import {Flutes,StubbyAntenna,pttHandlers} from "./TouchHandheld";
import {KeyList,useKeypadMenu} from "./KeypadHandheld";

// All-band handheld, laid out from Sean's APX 8000 photo (800×800, radio at x 320–489,
// y 46–754). The body is one SVG in the photo's own pixels; knobs, keys and the screen
// sit on top at the same photo boxes, scaled by K. The photo's long whip is swapped for
// a stubby antenna, so the face starts at photo y 274.
const K=1.8,OX=318,OY=274,W=174,H=482;
const {at}=photoBoxes(OX,OY,K);
const S=photoBoxes(367,477,K),M=photoBoxes(367,496,K);
// The screen's clock reads like the photo's "04:15AM".
const ampm=t=>{const d=new Date(t),h=d.getHours();return String(h%12||12).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")+(h<12?"AM":"PM")};

function ChannelKnob({f}){
  const turn=f.channelIndex*Math.PI/7,a=turn-1.05,show=Math.cos(a)>0.15,ix=402.8+8.6*Math.sin(a);// index ridge starts on the left, as in the photo
  return <svg viewBox="386 376 34 44" className="ab-knob-svg" aria-hidden="true">
    <defs>
      <linearGradient id="abKnobC" x1="0" x2="1"><stop offset="0" stopColor="#151617"/><stop offset=".22" stopColor="#3a3c3e"/><stop offset=".5" stopColor="#6c6e70"/><stop offset=".78" stopColor="#3a3c3e"/><stop offset="1" stopColor="#141516"/></linearGradient>
      <linearGradient id="abCollar" x1="0" x2="1"><stop offset="0" stopColor="#202224"/><stop offset=".28" stopColor="#9a9c9e"/><stop offset=".45" stopColor="#5d5f61"/><stop offset=".8" stopColor="#3a3c3e"/><stop offset="1" stopColor="#1b1c1e"/></linearGradient>
      <clipPath id="abChanClip"><path d="M391.5,410 L391.8,392 Q392.5,383 397,380 Q401.5,377.6 406,379.2 Q412.5,382 413.6,392 L414,410 Z"/></clipPath>
    </defs>
    <path d="M388,409.5 L418,409.5 L418.6,419 L387.4,419 Z" fill="url(#abCollar)"/>
    <path d="M388,412.6 L418.2,412.6" stroke="#18191a" strokeWidth=".8"/>
    <path d="M391.5,410 L391.8,392 Q392.5,383 397,380 Q401.5,377.6 406,379.2 Q412.5,382 413.6,392 L414,410 Z" fill="url(#abKnobC)" stroke="#0c0d0e" strokeWidth=".6"/>
    <g clipPath="url(#abChanClip)">
      <Flutes cx={402.8} top={384} bottom={409} rTop={9} rBottom={11.4} n={10} width={2.3} turn={turn}/>
      <path d="M391,398.2 L415,398.2" stroke="#0d0e0f" strokeWidth=".9"/>
      {show&&<rect x={ix-1.1} y="381.5" width="2.2" height="12" rx="1.1" fill="#eeeff0" opacity={0.45+0.55*Math.cos(a)}/>}
    </g>
  </svg>;
}
function VolumeKnob({volume,muted}){
  const turn=(muted?0:volume)*0.26;
  return <svg viewBox="449 399 41 35" className="ab-knob-svg" aria-hidden="true">
    <defs>
      <linearGradient id="abKnobV" x1="0" x2="1"><stop offset="0" stopColor="#18191a"/><stop offset=".25" stopColor="#3a3b3c"/><stop offset=".55" stopColor="#5a5c5d"/><stop offset=".85" stopColor="#353637"/><stop offset="1" stopColor="#1a1b1c"/></linearGradient>
      <clipPath id="abVolClip"><path d="M452,433 L452,412 Q452.4,402.6 461,402.4 L479,402.4 Q487.4,402.6 487.8,412 L488,433 Z"/></clipPath>
    </defs>
    <path d="M452,433 L452,412 Q452.4,402.6 461,402.4 L479,402.4 Q487.4,402.6 487.8,412 L488,433 Z" fill="url(#abKnobV)" stroke="#0c0d0e" strokeWidth=".6"/>
    <g clipPath="url(#abVolClip)">
      <g opacity=".7"><Flutes cx={470} top={404} bottom={434} rTop={17.6} rBottom={18} n={18} width={2.4} turn={turn} end="flat"/></g>
      <rect x="483.6" y="408" width="2.6" height="17" rx="1.3" fill="#f2f3f4" opacity=".85"/>
    </g>
    <path d="M454.6,407 Q456.6,403.4 461,403.2 L479,403.2 Q483.4,403.4 485.4,407" fill="none" stroke="#8a8c8e" strokeOpacity=".55" strokeWidth=".8"/>
  </svg>;
}

// The handheld's static body in photo pixels: stubby antenna, head with the knob deck, front cover seams, display well, key troughs and the battery
// with its gold contacts.
function Body(){
  const housing="M330,421 Q336,417 350,416.5 L452,416.5 L484,417.6 Q487.4,418.6 487,424 L485,432 L485,446 L487,454 L487,472 Q486.4,478 481,481.4 Q474.6,485.6 471.6,491 L468,500 L468,508 L470.4,514 L470.6,745 Q469.6,751.4 457,752 L353,752 Q340.6,751.4 339,745 L339,494 Q336,490.4 331,486.6 Q322,479.6 320.4,470 L320.4,460 Q321,446 324,436 Q326,427.6 330,421 Z";
  return <svg className="ab-body" viewBox={`${OX} ${OY} ${W} ${H}`} aria-hidden="true">
    <defs>
      <linearGradient id="abBody" x1="320" x2="488" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#454647"/><stop offset=".12" stopColor="#3a3b3c"/><stop offset=".3" stopColor="#323333"/><stop offset=".7" stopColor="#313232"/><stop offset=".88" stopColor="#373838"/><stop offset="1" stopColor="#434444"/></linearGradient>
      <linearGradient id="abCover" x1="0" y1="416" x2="0" y2="470" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".16"/><stop offset=".45" stopColor="#fff" stopOpacity=".07"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
      <radialGradient id="abEar" cx="331" cy="448" r="22" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".13"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
      <radialGradient id="abEarR" cx="477" cy="452" r="20" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".1"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
      <linearGradient id="abDeck" x1="0" y1="414" x2="0" y2="430" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#6a6c6c"/><stop offset=".5" stopColor="#525454"/><stop offset="1" stopColor="#3a3b3b"/></linearGradient>
      <linearGradient id="abBadge" x1="0" y1="424" x2="0" y2="450" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fafafa"/><stop offset=".55" stopColor="#c9cacb"/><stop offset="1" stopColor="#8e9091"/></linearGradient>
      <linearGradient id="abGold" x1="0" y1="721" x2="0" y2="740" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#6e5523"/><stop offset=".45" stopColor="#a8873f"/><stop offset=".85" stopColor="#c9a95c"/><stop offset="1" stopColor="#fff2c4"/></linearGradient>
      <filter id="abGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3 1.75"/><feComposite in2="SourceAlpha" operator="in"/></filter>
      <filter id="abSpeck" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="21"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 3.4 -2.05"/><feComposite in2="SourceAlpha" operator="in"/></filter>
    </defs>
    {/* stubby antenna */}
    <StubbyAntenna id="abStub" x1={328} x2={359} top={282} bottom={430}/>
    {/* housing */}
    <path d={housing} fill="url(#abBody)" stroke="#0f1010" strokeWidth=".8"/>
    <path d={housing} fill="#000" filter="url(#abGrain)" opacity=".75"/>
    <path d={housing} fill="#000" filter="url(#abSpeck)" opacity=".5"/>
    <path d="M330,421 Q336,417 350,416.5 L452,416.5 L484,417.6 Q487.4,418.6 487,424 L485,432 L485,446 L487,454 L487,472 L320.4,472 L320.4,460 Q321,446 324,436 Q326,427.6 330,421 Z" fill="url(#abCover)"/>
    <circle cx="331" cy="448" r="22" fill="url(#abEar)"/><circle cx="477" cy="452" r="20" fill="url(#abEarR)"/>
    {/* knob deck, guard posts and the arc where the top cover meets the front */}
    <path d="M352,417 L452,417 L458,425 Q452,428.4 440,427 L362,427.6 Q350,428.6 343.4,433.6 L340.6,424 Q345,418 352,417 Z" fill="url(#abDeck)"/>
    {[[372,378],[426,432]].map(([a,b])=><g key={a}><path d={`M${a},418 L${a},412.6 Q${(a+b)/2},408.4 ${b},412.6 L${b},418 Z`} fill="#2c2d2e" stroke="#101111" strokeWidth=".6"/><path d={`M${a+1},412.8 Q${(a+b)/2},410 ${b-1},412.8`} fill="none" stroke="#8a8c8c" strokeWidth=".6"/></g>)}
    <path d="M321.6,452 Q331,435 362,427.6 L440,427 Q452,428.4 459.6,437.6 L460.4,700" fill="none" stroke="#0e0f0f" strokeWidth="1.6"/>
    <path d="M321.6,453.6 Q331,437 362,429.2 L440,428.6 Q451,430 458.4,438.6" fill="none" stroke="#606262" strokeOpacity=".55" strokeWidth=".6"/>
    <path d="M341,437 L341,700" stroke="#0e0f0f" strokeWidth="1.6"/>
    <path d="M342.2,440 L342.2,700 M461.6,440 L461.6,700" stroke="#5a5c5c" strokeOpacity=".45" strokeWidth=".55"/>
    {/* right-hand ear round the volume knob */}
    <path d="M452,433 Q466,430 486,433" fill="none" stroke="#151616" strokeWidth=".9"/>
    {/* front badge */}
    <circle cx="402.6" cy="437" r="12.8" fill="url(#abBadge)" stroke="#2b2c2d" strokeWidth="1"/>
    <text x="402.6" y="441.4" textAnchor="middle" fontSize="12" fontWeight="900" fill="#2a2b2c" fontFamily="Arial Black,Arial,Helvetica,sans-serif" letterSpacing="-.3">RN</text>
    {/* left side: PTT strip and the button under it; right side buttons */}
    <path d="M330.4,494 Q330,491.6 333,491.4 L341,491.4 L341,626 L333,626 Q330,625.6 330.4,623 Z" fill="#3c3d3e" stroke="#121313" strokeWidth=".7"/>
    <path d="M333.6,496 L333.6,540" stroke="#8a8b8c" strokeOpacity=".5" strokeWidth="2.2" strokeLinecap="round"/>
    <path d="M331,595 Q325,595.6 325,603 L325,612 Q325,619.6 331,620.4 Z" fill="#2c2d2e" stroke="#101111" strokeWidth=".7"/>
    <path d="M470,512 Q474.6,513 474.6,517 L474.6,524 Q474.6,528.4 470,528.6 Z" fill="#2e2f30" stroke="#101111" strokeWidth=".7"/>
    <path d="M470.4,578 Q476.4,586 476.4,592 Q476,595.6 470.4,597 Z" fill="#2e2f30" stroke="#101111" strokeWidth=".7"/>
    {/* display well */}
    <rect x="363" y="474.2" width="80.6" height="77.2" rx="5" fill="#1b1c1c" stroke="#0d0e0e" strokeWidth=".8"/>
    <rect x="364" y="475.2" width="78.6" height="75.2" rx="4.4" fill="none" stroke="#5a5c5c" strokeOpacity=".6" strokeWidth=".6"/>
    {/* key troughs */}
    <rect x="362.4" y="556.2" width="80.8" height="19.8" rx="7.6" fill="#1a1b1b"/>
    <rect x="358.2" y="577.4" width="89.6" height="37.4" rx="7" fill="#1a1b1b"/>
    {[[617.6,636],[637.6,656],[656.6,675],[676.6,696]].map(([a,b])=><rect key={a} x="358.4" y={a} width="89.2" height={b-a} rx="7.6" fill="#1c1d1d"/>)}
    {/* battery: seam, lower lip and four gold contacts */}
    <path d="M338.6,700.6 L470.8,700.6" stroke="#0e0f0f" strokeWidth="1.6"/>
    <path d="M338.6,702.2 L470.8,702.2" stroke="#5e6060" strokeOpacity=".55" strokeWidth=".6"/>
    <path d="M339,741.4 L470.6,741.4 L470.4,746 Q469.4,751.4 457,752 L353,752 Q340.6,751.4 339.2,746 Z" fill="#33302a" opacity=".85"/>
    {[362,381,415,433].map(x=><g key={x}><path d={`M${x},739.6 L${x},724 Q${x},721.4 ${x+2.4},721.4 L${x+7.6},721.4 Q${x+10},721.4 ${x+10},724 L${x+10},739.6 Z`} fill="url(#abGold)" stroke="#3a2c10" strokeWidth=".5"/></g>)}
  </svg>;
}

const SOFT_X=[[365,389],[391,413],[417,440]];
const KEYS=[["1",", . ?"],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],["7","PQRS"],["8","TUV"],["9","WXYZ"],["*",""],["0",""],["#",""]];
const KEY_COLS=[[361,385],[391,415],[420,445]],KEY_ROWS=[[620,633.4],[640,653.4],[659,672.4],[679,692.6]];
const keyIcon={
  "*":<svg viewBox="0 0 10 4"><path d="M1 1.2v1.6h8V1.2" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>,
  "0":<svg viewBox="0 0 8 8"><path d="M4 .8 7.2 4 4 7.2.8 4Z" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>,
  "#":<svg viewBox="0 0 9 9"><path d="M2.2 1.2 1 2.4 6.6 8l1.2-1.2Z" fill="currentColor"/><circle cx="6.4" cy="2.6" r="1.6" fill="none" stroke="currentColor" strokeWidth="1"/></svg>,
};
const DOTS=[[[50,50]],[[34,50],[66,50]],[[50,32],[34,66],[66,66]]];

// The monochrome screen, laid out like the photo: status icons, time, then three centred
// lines (zone, channel, activity) and three softkey labels over the dot buttons.
function Screen({p,f,ui}){
  const {channelName,zoneName,connected,muted,scanning}=p;
  const {screen,soft}=ui;
  const b=f.banner;
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(id)},[]);
  return <div className="ab-screen" style={{...at(367,477,440,549),filter:"brightness(var(--apx-bright))"}}>
    <div className="ab-status" style={S.at(368,477.6,439,486.6)}>
      <span className="ab-bars" title={connected?"Signal":"No signal"}><b/>{[1,2,3,4].map(n=><i key={n} className={n<=f.bars?"on":""}/>)}</span>
      <svg className="ab-si" viewBox="0 0 12 14" aria-label="Zone"><path d="M1.5 2h9L2 12h9" fill="none" stroke="currentColor" strokeWidth="2.2"/></svg>
      <svg className={"ab-si"+(connected?"":" off")} viewBox="0 0 14 14" aria-label="On air"><path d="M1.5 1.5v11M12.5 1.5v11M3.5 7h6M7 4.5 9.6 7 7 9.5" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>
      {muted&&<svg className="ab-si" viewBox="0 0 14 14" aria-label="Muted"><path d="M1 5h3l4-3.5v11L4 9H1Z" fill="currentColor"/><path d="M9.5 4.5l4 5m0-5-4 5" stroke="currentColor" strokeWidth="1.6"/></svg>}
      <span className="ab-batt" style={S.at(432.4,478.4,438.4,486.2)}><i/></span>
    </div>
    <div className="ab-time" style={S.at(368.6,487.4,439,495.4)}><span>{ampm(now)}</span>
      {scanning&&<em>SCAN</em>}{f.ledTx?<em className="tx">TX</em>:f.ledRx?<em className="rx">RX</em>:null}</div>
    {screen==="home"?<button type="button" className="ab-main" style={S.at(367,496,440,532)} onClick={ui.openChannels} title="Choose channel">
      {f.entry?<>
        <span className="ab-zname" style={M.at(368,496.4,439,504.4)}>Channel number</span>
        <span className="ab-cname" style={M.at(368,505,439,516.4)}>CH {f.entry}<u>_</u></span>
        <span className="ab-act" style={M.at(368,517.4,439,525.4)}># Enter · * Clear</span>
      </>:<>
        <span className="ab-zname" style={M.at(368,496.4,439,504.4)}>{zoneName||"All Zones"}</span>
        <span className="ab-cname" style={M.at(368,505,439,516.4)}>{channelName}</span>
        <span className={"ab-act "+b.tone} style={M.at(368,517.4,439,525.4)}>{b.title}{b.sub?" · "+b.sub:""}</span>
      </>}
    </button>:<KeyList ui={ui} prefix="ab" style={S.at(368,496,439,533)}/>}
    <div className="ab-soft" style={S.at(367,534,440,547)}>
      {soft.map((k,i)=><button type="button" key={i} className={k.tone||""} onClick={k.act||undefined} disabled={!k.act}>{k.label}</button>)}
    </div>
  </div>;
}

export function AllBandHandheld(p){
  const f=useFace(p);
  const {connected,muted,volume=7,ptt,onMute,onVolume,onPttDown,onPttUp,onScan,scanning,onTab,incoming,onAnswer,onDecline,call,onEndCall}=p;
  const ui=useKeypadMenu(p,f,ui=>[
    {label:"Zone",act:ui.openZones},
    {label:"Scan",act:onScan||null,tone:scanning?"on":""},
    {label:"Call",act:()=>onTab("calls")},
  ],3);
  const {screen,okKey,backKey,nav,digit,soft}=ui;
  // Home answers "go home" (Back in a list, Decline on a ringing call); the right-hand
  // key is menu / select.
  const homeKey=()=>{if(incoming)return onDecline?.();if(call)return onEndCall?.();if(f.entry)return f.pressKey("*");screen==="home"?f.goHome():ui.home()};
  const led=f.ledTx?" tx":f.ledRx?" rx":f.ledCall?" call":"";
  return <div className="ab" style={{"--apx-bright":0.55+f.brightness*0.15,width:W*K,height:H*K}}>
    <Body/>
    <i className={"ab-led"+led} style={at(380,413.4,386.4,416.6)} title="Transmit / receive light"/>
    <div className="ab-hold" style={at(449,399,490,434)}><Knob className="ab-knob" title={muted?"Volume (muted, click to unmute)":`Volume ${volume} (scroll to change, click to mute)`} onClick={onMute} onStep={dir=>onVolume?.(-dir)}><VolumeKnob volume={volume} muted={muted}/></Knob></div>
    <div className="ab-hold" style={at(386,376,420,420)}><Knob className="ab-knob" title="Channel (click or scroll to change)" onClick={()=>f.stepChannel(1)} onStep={f.stepChannel}><ChannelKnob f={f}/></Knob></div>
    <button type="button" className={"ab-ptt"+(ptt?" pressed":"")} style={at(326,491,342,627)} disabled={!connected} title="Push to talk (hold)" aria-label="Side PTT" {...pttHandlers(onPttDown,onPttUp)}/>
    <Screen p={p} f={f} ui={ui}/>
    {SOFT_X.map(([a,b],i)=><button type="button" key={i} className="ab-key ab-sk" style={at(a,559,b,573)} onClick={soft[i]?.act||undefined} disabled={!soft[i]?.act} title={soft[i]?.label||undefined} aria-label={"Softkey "+(i+1)}>
      {DOTS[i].map(([x,y],j)=><i key={j} style={{left:x+"%",top:y+"%"}}/>)}</button>)}
    <button type="button" className="ab-key ab-home" style={at(361,580,376,612)} onClick={homeKey} title="Home / Back" aria-label="Home">
      <svg viewBox="0 0 12 11"><path d="M6 .6 11.4 5.4h-1.6V10.4H2.2V5.4H.6Z" fill="currentColor"/><path d="M4.6 10.4V7.2h2.8v3.2" fill="#2e3030"/></svg></button>
    <button type="button" className="ab-key ab-menu" style={at(430,580,445,612)} onClick={okKey} title="Menu / Select" aria-label="Menu / OK">
      <svg viewBox="0 0 12 12"><rect x="2.6" y=".8" width="8.6" height="7.6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M4.6 3.4h4.6M4.6 5.6h3" stroke="currentColor" strokeWidth="1.1"/><path d="M.8 6.6c0 2.6 1.4 4.4 4.4 4.6l.6-2-1.6-.6-.4.8c-.8-.4-1.2-1.4-1.2-2.8Z" fill="currentColor"/></svg></button>
    <div className="ab-nav" style={at(381,580,425,612)}>
      {[["up","Up: next channel"],["right","Right: next zone"],["down","Down: previous channel"],["left","Left: previous zone"]].map(([d,t])=>
        <button type="button" key={d} className={d} onClick={()=>nav(d)} title={screen==="home"?t:d==="left"?"Back":d==="right"?"Select":d==="up"?"Up":"Down"} aria-label={d}><i/></button>)}
    </div>
    {KEYS.map(([d,l],i)=>{const c=KEY_COLS[i%3],r=KEY_ROWS[i/3|0];
      return <button type="button" key={d} className="ab-key ab-digit" style={at(c[0],r[0],c[1],r[1])} onClick={()=>digit(d)} aria-label={d}><b>{d}</b><small>{keyIcon[d]||l}</small></button>})}
  </div>;
}
