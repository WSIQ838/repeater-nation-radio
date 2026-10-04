import {FaceDisplay,Knob,photoBoxes,useFace,useFit,useHoldRepeat} from "./ControlHead";

// Field radio, laid out from Sean's Harris Falcon III photo (800×534: radio with its
// handles from x 15–780, y 129–500). The body, connectors and printing are one SVG in
// the photo's own pixels; the LCD, keypad and mode knob sit on top at the same boxes.
// VOL + and − is the volume, PRE + and − steps channels, ◀ ▶ step zones, and the big
// knob on the right is the power and mode switch (OFF, or on at PT).
const K=1.15,OX=10,OY=124;
const {at,dot}=photoBoxes(OX,OY,K);

const KEYS=[
  ["1","ABC","CALL"],["2","DEF","LT"],["3","GHI","MODE"],
  ["4","JKL","SQL"],["5","MNO","ZERO"],["6","PQR","▲"],
  ["7","STU","OPT"],["8","VWX","PGM"],["9","YZ?","▼"],
];
const COLS=[[343,371],[383,411],[423,451]],ROWS=[[367,388],[395,416],[423,444],[451,471]];
const OFF_ANGLE=-75,ON_ANGLE=-16;// knob pointer at OFF, or at PT, as printed round it

// 0.7-ish hex grid of contacts inside radius r, as on the J3 data connector.
const pins=(cx,cy,r,step)=>{const out=[];for(let j=-4;j<=4;j++)for(let i=-4;i<=4;i++){const x=cx+(i+(j&1)*.5)*step,y=cy+j*step*.866;if(Math.hypot(x-cx,y-cy)<=r)out.push([x,y])}return out};
const J3_PINS=pins(201,441,22.5,7.6);
const ring=(cx,cy,r,n,start=-90)=>Array.from({length:n},(_,i)=>{const a=(start+i*360/n)*Math.PI/180;return [cx+r*Math.cos(a),cy+r*Math.sin(a)]});

const Txt=({x,y,s=8.4,children,...r})=><text x={x} y={y} fontSize={s} textAnchor="middle" className="fal-print" {...r}>{children}</text>;
const Screw=({x,y})=><g>
  <circle cx={x} cy={y} r="16" fill="#3b3e30"/>
  <circle cx={x} cy={y} r="13.5" fill="#1d1f18"/>
  <circle cx={x} cy={y} r="10.5" fill="url(#falBolt)"/>
  <path d={ring(x,y,4.6,6,0).map(([a,b],i)=>(i?"L":"M")+a.toFixed(1)+","+b.toFixed(1)).join("")+"Z"} fill="#1b1b1a"/>
</g>;
const Metal=({x,y,r})=><g>
  <circle cx={x} cy={y} r={r} fill="#7d6d66"/>
  <circle cx={x} cy={y} r={r-2.5} fill="url(#falMetal)"/>
  <circle cx={x} cy={y} r={r-8} fill="#675f54"/>
  <circle cx={x} cy={y} r={r-10.5} fill="url(#falMetal)"/>
</g>;
const Small=({x,y})=><g>
  <circle cx={x} cy={y} r="20" fill="#2e3127"/>
  <circle cx={x} cy={y} r="17.5" fill="url(#falSteel)"/>
  {ring(x,y,15.5,4,-45).map(([a,b],i)=><rect key={i} x={a-2} y={b-2} width="4" height="4" fill="#1a1a1a" transform={`rotate(${45+i*90} ${a} ${b})`}/>)}
  <circle cx={x} cy={y} r="11.5" fill="#151513"/>
  {[[x,y],...ring(x,y,5.5,6)].map(([a,b],i)=><circle key={i} cx={a} cy={b} r="1.5" fill="#b48d55"/>)}
</g>;

function FalconBody(){
  return <svg className="fal-svg" viewBox={`${OX} ${OY} 778 380`} aria-hidden="true">
    <defs>
      <linearGradient id="falFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6a6d55"/><stop offset=".45" stopColor="#5b5e48"/><stop offset="1" stopColor="#50543f"/></linearGradient>
      <linearGradient id="falBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#74785f"/><stop offset="1" stopColor="#61654e"/></linearGradient>
      <linearGradient id="falSlopeL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5e624c"/><stop offset="1" stopColor="#737762"/></linearGradient>
      <linearGradient id="falSlopeR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stopColor="#5e624c"/><stop offset="1" stopColor="#737762"/></linearGradient>
      <radialGradient id="falMetal" cx=".42" cy=".38" r=".7"><stop offset="0" stopColor="#efe5de"/><stop offset=".55" stopColor="#b8a8a0"/><stop offset="1" stopColor="#7a6a63"/></radialGradient>
      <radialGradient id="falSteel" cx=".42" cy=".38" r=".7"><stop offset="0" stopColor="#8a8a86"/><stop offset="1" stopColor="#3a3a37"/></radialGradient>
      <radialGradient id="falBolt" cx=".4" cy=".35" r=".75"><stop offset="0" stopColor="#9b9a92"/><stop offset=".6" stopColor="#5d5c56"/><stop offset="1" stopColor="#2d2d2a"/></radialGradient>
      <radialGradient id="falBlue" cx=".45" cy=".4" r=".7"><stop offset="0" stopColor="#7cc0ea"/><stop offset="1" stopColor="#3a7fb5"/></radialGradient>
      <linearGradient id="falSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a2a28"/><stop offset=".4" stopColor="#6a6a66"/><stop offset=".7" stopColor="#3c3c39"/><stop offset="1" stopColor="#1f1f1d"/></linearGradient>
    </defs>

    {/* carry handles */}
    {[["M98,250 C58,246 28,252 25,290 L27,330 Q33,337 29,346 L31,440 C31,472 40,489 70,490 L104,485",1],
      ["M700,250 C740,246 772,252 775,292 L777,440 C777,472 768,489 738,490 L704,485",-1]].map(([d,s],i)=><g key={i} fill="none" strokeLinecap="round">
      <path d={d} stroke="#2c2a29" strokeWidth="10.5"/>
      <path d={d} stroke="#716d6a" strokeWidth="2.4" transform={`translate(${-1.8*s} -1.6)`} opacity=".85"/>
    </g>)}

    {/* chassis behind the front plate, battery cover with its ribbed face */}
    <path d="M255,131 H598 L656,150 L724,226 H70 L139,150 Z" fill="url(#falBack)" stroke="#4c503d" strokeLinejoin="round" strokeWidth="2"/>
    <path d="M139,150 L268,151 L251,224 L72,226 Z" fill="url(#falSlopeL)"/>
    <path d="M586,151 L656,150 L724,226 L603,224 Z" fill="url(#falSlopeR)"/>
    <rect x="261" y="128.5" width="332" height="23" rx="7" fill="#808467" stroke="#5b5f49"/>
    <path d="M266,130.5 H588" stroke="#9a9e82" strokeWidth="1.4"/>
    <path d="M268,151 H586 L603,224 H251 Z" fill="#6c7059"/>
    {Array.from({length:9},(_,i)=>{const y=157+i*7.6,t=(y-151)/73,l=268-17*t,r=586+17*t;return <g key={i}>
      <path d={`M${l+6},${y} H${r-6}`} stroke="#50543f" strokeWidth="1.8"/>
      <path d={`M${l+6},${y+1.8} H${r-6}`} stroke="#868a72" strokeWidth=".9"/>
    </g>})}
    {[[212,295],[307,392],[405,492]].map(([a,b])=><rect key={a} x={a} y="225" width={b-a} height="7" rx="2" fill="#868980" stroke="#5f6257" strokeWidth=".8"/>)}

    {/* front plate: corner flanges with the handle bosses, cut back between them */}
    <path d="M86,224 H710 Q724,224 724,238 V276 Q724,286 714,289 L688,295 V431 L706,437 Q718,441 718,453 V484 Q718,497 705,497 H94 Q80,497 80,484 V453 Q80,441 92,437 L120,431 V295 L84,289 Q70,286 70,276 V238 Q70,224 86,224 Z"
      fill="url(#falFront)" stroke="#43473a" strokeWidth="1.6"/>
    <path d="M88,226.5 H708" stroke="#80846b" strokeWidth="1.3" opacity=".8"/>
    <rect x="132" y="236" width="544" height="252" rx="13" fill="none" stroke="#474b39" strokeWidth="1.5" opacity=".7"/>
    {/* raised island round the display and the keypad well */}
    <path d="M296,242 H498 Q518,242 520,262 L522,474 Q522,484 510,486 H286 Q274,484 274,474 L276,262 Q278,242 296,242 Z" fill="#5f634b" stroke="#4b503b" strokeWidth="1.4"/>
    <rect x="294" y="359" width="208" height="120" rx="13" fill="#4f543d" stroke="#43473a" strokeWidth="1.4"/>
    {[[124,254],[666,254],[134,467],[664,469]].map(([x,y])=><Screw key={x} x={x} y={y}/>)}

    {/* side screw sticking out of the left flank */}
    <rect x="82" y="340" width="28" height="35" rx="4" fill="url(#falSide)"/>
    <rect x="104" y="343" width="17" height="29" rx="2" fill="url(#falSide)" opacity=".85"/>

    {/* J7 antenna (BNC in a round flange) */}
    <rect x="183" y="270" width="17" height="7" rx="2" fill="#b4a49b"/>
    <Metal x={191.5} y={313} r={41}/>
    <circle cx="191.5" cy="313" r="21" fill="#6b5e57"/>
    <circle cx="191.5" cy="313" r="17" fill="url(#falMetal)"/>
    <circle cx="191.5" cy="313" r="10.5" fill="#d9cec6" stroke="#8d7d75"/>
    <circle cx="191.5" cy="313" r="5" fill="#f5f0ea"/>
    <circle cx="191.5" cy="313" r="1.6" fill="#7a4e3a"/>
    {/* J2 GPS in a hex nut */}
    <path d={ring(250.75,380,22,6,0).map(([a,b],i)=>(i?"L":"M")+a.toFixed(1)+","+b.toFixed(1)).join("")+"Z"} fill="#2b2b29" stroke="#141413"/>
    <circle cx="250.75" cy="380" r="15" fill="#191918"/>
    <circle cx="250.75" cy="380" r="9" fill="#2f2f2d" stroke="#555"/>
    <circle cx="250.75" cy="380" r="5" fill="#141414" stroke="#7a7a76"/>
    {/* J3 data, J1 audio: round multi-pin connectors with blue inserts */}
    <Metal x={201} y={440} r={41}/>
    <circle cx="200" cy="402" r="1.8" fill="#d6b066"/>
    <circle cx="201" cy="441" r="27" fill="url(#falBlue)" stroke="#6f625b" strokeWidth="1.5"/>
    {J3_PINS.map(([x,y],i)=><circle key={i} cx={x} cy={y} r="2.7" fill="#f1e5d2" stroke="#b39d82" strokeWidth=".5"/>)}
    <Metal x={591} y={435} r={42}/>
    <circle cx="591" cy="397" r="1.8" fill="#d6b066"/>
    <circle cx="591" cy="444" r="20" fill="url(#falBlue)" stroke="#6f625b" strokeWidth="1.5"/>
    {[[591,444],...ring(591,444,11,6,-90)].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="2.6" fill="#e9d7b6" stroke="#a88f6a" strokeWidth=".5"/>)}
    {/* J4 KDU, J5 USB */}
    <Small x={542} y={360}/>
    <Small x={631} y={360}/>

    {/* printing */}
    <Txt x={247.5} y={252}>J7</Txt><Txt x={247.5} y={261}>HF/VHF</Txt><Txt x={247.5} y={270}>ANT</Txt>
    <path d="M174,351 V366 M162,366 H186 M166,371.5 H182 M170,377 H178" stroke="#f2f2ee" strokeWidth="2" fill="none"/>
    <Txt x={263.75} y={404}>J2</Txt><Txt x={263.75} y={413}>GPS</Txt>
    <Txt x={252.5} y={462}>J3</Txt><Txt x={252.5} y={471}>DATA</Txt>
    <Txt x={528} y={392}>J4</Txt><Txt x={528} y={401}>KDU</Txt>
    <Txt x={651} y={393}>J5</Txt>
    <g stroke="#f2f2ee" strokeWidth="1.4" fill="#f2f2ee"><path d="M637,399.5 H665 M646,399.5 L651,395.5 H655 M649,399.5 L654,403.5 H658" fill="none"/><circle cx="637.5" cy="399.5" r="2"/><path d="M665,397.2 L668,399.5 L665,401.8 Z"/><rect x="655" y="393.8" width="3.4" height="3.4" stroke="none"/><circle cx="658.5" cy="403.5" r="1.7" stroke="none"/></g>
    <Txt x={524} y={464}>J1</Txt><Txt x={524} y={473}>AUDIO</Txt>
    <Txt x={536} y={298}>OFF</Txt>
    <Txt x={576} y={249.5}>PT</Txt><Txt x={606} y={249.5}>CC</Txt><Txt x={637.5} y={266}>LD</Txt>
    <rect x="537" y="256.5" width="18" height="11" fill="none" stroke="#f2f2ee" strokeWidth="1.3"/><Txt x={546} y={265}>CT</Txt>
    <rect x="639.5" y="287.5" width="16" height="11" fill="none" stroke="#f2f2ee" strokeWidth="1.3"/><Txt x={647.5} y={296}>Z</Txt>

    {/* display bezel with the badge printed under the LCD */}
    <path d="M297,250.5 H500 Q510,250.5 510,260.5 V335.5 Q510,345.5 500,345.5 H294 Q284,345.5 284,335.5 V263.5 Z" fill="#141414" stroke="#2b2c27" strokeWidth="1.2"/>
    <path d="M308,337.5 L323,328 L315,335.8 Z" fill="#f2f2ee"/>
    <text x="347" y="331.5" fontSize="12.5" textAnchor="middle" textLength="72" lengthAdjust="spacingAndGlyphs" className="fal-print fal-badge">REPEATER</text>
    <text x="456" y="330.5" fontSize="10" textAnchor="middle" textLength="50" lengthAdjust="spacingAndGlyphs" className="fal-print fal-badge">NATION</text>
  </svg>;
}

export function FalconRadio(p){
  const f=useFace(p,{layout:"falcon"});
  const {connected,state,muted,volume=7,onPower,onVolume}=p;
  const [ref,zoom]=useFit(895);
  const vol=useHoldRepeat(dir=>onVolume?.(dir));
  const pre=useHoldRepeat(dir=>f.stepChannel(dir));
  const on=connected||state==="connecting";
  // Clockwise off OFF switches the radio on; back to OFF switches it off.
  const turnMode=dir=>{if(dir<0&&!connected&&state!=="connecting")onPower?.();else if(dir>0&&connected)onPower?.()};
  const soft=f.bottom.slice(0,4);
  return <div ref={ref} className="fx fal" style={{"--apx-bright":0.55+f.brightness*0.15,zoom}}>
    <div style={at(OX,OY,OX+778,OY+380)}><FalconBody/></div>

    <div className="fx-screen fal-screen" style={at(310,265,486,316)}><FaceDisplay p={p} f={f} menus={false} softRow={soft} className="fx-display fal-display"/></div>
    {soft.map((k,i)=><button type="button" key={i} className="fal-lcdkey" style={at(310+i*44,308,354+i*44,316)} onClick={k.act||undefined} disabled={!k.act||k.disabled} aria-label={k.label||"Unused softkey"} title={k.label||undefined}/>)}

    <div className="fal-key fal-rocker" style={at(303,367,331,416)} aria-hidden="true"><span>+</span><b>VOL</b><span>−</span></div>
    <button type="button" className="fal-half" style={at(303,367,331,391.5)} {...vol(1)} title={`Volume up (${muted?"muted":volume})`} aria-label="Volume up"/>
    <button type="button" className="fal-half" style={at(303,391.5,331,416)} {...vol(-1)} title={`Volume down (${muted?"muted":volume})`} aria-label="Volume down"/>
    <div className="fal-key fal-rocker" style={at(463,367,491,416)} aria-hidden="true"><span>+</span><b>PRE</b><span>−</span></div>
    <button type="button" className="fal-half" style={at(463,367,491,391.5)} {...pre(1)} title="Next preset channel" aria-label="Preset up"/>
    <button type="button" className="fal-half" style={at(463,391.5,491,416)} {...pre(-1)} title="Previous preset channel" aria-label="Preset down"/>

    {KEYS.map(([d,l,fn],i)=>{const c=COLS[i%3],r=ROWS[i/3|0];
      return <button type="button" key={d} className="fal-key fal-digit" style={at(c[0],r[0],c[1],r[1])} onClick={()=>f.pressKey(d)} aria-label={d}><b>{d}</b><small>{l}<br/>{fn}</small></button>})}
    <button type="button" className="fal-key fal-word" style={at(304,423,332,444)} onClick={()=>{f.pressKey("*");f.setView("home")}} title="Clear" aria-label="CLR">CLR</button>
    <button type="button" className="fal-key fal-word" style={at(462,423,490,444)} onClick={()=>f.pressKey("#")} title="Enter channel number" aria-label="ENT">ENT</button>
    <button type="button" className="fal-key fal-digit" style={at(COLS[0][0],ROWS[3][0],COLS[0][1],ROWS[3][1])} onClick={()=>f.pressKey("0")} aria-label="0"><b>0</b><small className="fal-ring">{"↻"}</small></button>
    <button type="button" className="fal-key fal-arrow" style={at(COLS[1][0],ROWS[3][0],COLS[1][1],ROWS[3][1])} onClick={()=>f.stepZone(-1)} title="Previous zone" aria-label="Left"><i className="l"/></button>
    <button type="button" className="fal-key fal-arrow" style={at(COLS[2][0],ROWS[3][0],COLS[2][1],ROWS[3][1])} onClick={()=>f.stepZone(1)} title="Next zone" aria-label="Right"><i className="r"/></button>

    <div className="fx-hold fal-hold" style={dot(592,301,68)}>
      <Knob className="fal-knob" angle={on?ON_ANGLE:OFF_ANGLE} onClick={state==="connecting"?undefined:onPower} onStep={turnMode}
        title={connected?"Mode: on (click, or turn to OFF, to switch off)":state==="connecting"?"Switching on…":"Mode: OFF (click, or turn right, to switch on)"}/>
    </div>
  </div>
}
