import {useEffect,useRef,useState} from "react";
import {Power} from "lucide-react";
import {ControlHead,FaceDisplay,Knob,O7Icon,O7_KEYS,photoBoxes,useFace} from "./ControlHead";
import {TouchHandheld} from "./TouchHandheld";
import {KeypadHandheld} from "./KeypadHandheld";

// Radios the user can pick from. They are being redone one at a time from Sean's
// photos; each draws the same radio through useFace/FaceDisplay (ControlHead.jsx),
// so a new radio needs only its layout and an entry in FACES.
export const FACES=[
  {id:"control-head",label:"Dispatch control head",note:"Full keypad, ten softkeys, P1–P5"},
  {id:"dash-head",label:"Dash mount head",note:"Keypad, four softkeys, knob and nav diamond"},
  {id:"slim-head",label:"Slim mobile head",note:"Two knobs, five softkeys, P key"},
  {id:"touch-handheld",label:"Touchscreen handheld",note:"Touch screen, two top knobs, P1–P6"},
  {id:"keypad-handheld",label:"Keypad handheld",note:"Colour screen, full keypad, nav pad, P1/P2"},
];
export const DEFAULT_FACE="control-head";
const FACE_KEY="rn-face";
// A radio that has been removed from the list falls back to the default; the earlier
// touchscreen and keypad portables map to the handhelds redone from the N70 and R7 photos.
const RENAMED={"smart-portable-p":"touch-handheld","keypad-portable":"keypad-handheld"};
export const loadFace=()=>{try{let v=localStorage.getItem(FACE_KEY);v=RENAMED[v]||v;return FACES.some(f=>f.id===v)?v:DEFAULT_FACE}catch{return DEFAULT_FACE}};
export const saveFace=v=>{try{localStorage.setItem(FACE_KEY,v)}catch{}};

// Parts shared by the photo-matched mobile heads.
const Inert=({style,className=""})=><div className={className} style={style} aria-hidden="true"/>;
const Jack=({style})=><div className="fx-jack" style={style} aria-hidden="true"><svg viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="11.5" fill="#141416" stroke="#2b2b2f" strokeWidth="1.2"/>
  {[[20,12],[26,15],[27.5,21.5],[24,27],[16,27],[12.5,21.5],[14,15],[20,20]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="1.3" fill="#3a3a3f"/>)}
</svg></div>;
const Screw=({style})=><div className="fx-screw" style={style} aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#18181b"/><circle cx="10" cy="10" r="7.5" fill="#9a9a9f"/><path d="M10 4.8 11.5 8.5 15.2 10 11.5 11.5 10 15.2 8.5 11.5 4.8 10 8.5 8.5z" fill="#2a2a2e"/></svg></div>;
const NavDiamond=({f,style})=><div className="fx-nav" style={style}>
  <div className="fx-nav-pad">
    <button type="button" onClick={()=>f.stepZone(-1)} title="Previous zone" aria-label="Up"/>
    <button type="button" onClick={()=>f.stepChannel(1)} title="Next channel" aria-label="Right"/>
    <button type="button" onClick={()=>f.stepChannel(-1)} title="Previous channel" aria-label="Left"/>
    <button type="button" onClick={()=>f.stepZone(1)} title="Next zone" aria-label="Down"/>
  </div>
  <i className="up"/><i className="down"/><i className="left"/><i className="right"/>
</div>;
const Softkeys=({f,xs,y,box,count=xs.length})=>f.bottom.slice(0,count).map((k,i)=><button type="button" key={i} className={"fx-soft"+(k.tone?" "+k.tone:"")} style={box(xs[i][0],y[0],xs[i][1],y[1])}
  onClick={k.act||undefined} disabled={!k.act||k.disabled} aria-label={k.label||"Unused softkey"} title={k.label||undefined}><i/></button>);
const Leds=({f,boxes})=>boxes.map((b,i)=><i key={i} className={"fx-led"+([f.ledTx&&" tx",f.ledRx&&" rx",f.ledCall&&" call"][i]||"")} style={b} title={["Transmit","Receive","Call"][i]}/>);
const brightnessStep=f=>()=>f.setBrightness(b=>b>0?b-1:3);
// The wide heads are drawn at a fixed size; in a narrow window they are zoomed down
// to fit the radio column instead of overflowing it.
function useFit(width){
  const ref=useRef(null),[zoom,setZoom]=useState(1);
  useEffect(()=>{
    const host=ref.current?.parentElement;if(!host||typeof ResizeObserver==="undefined")return;
    const ro=new ResizeObserver(()=>{const w=host.clientWidth;setZoom(w&&w<width?Math.max(.5,w/width):1)});
    ro.observe(host);return()=>ro.disconnect();
  },[width]);
  return [ref,zoom];
}

// Dash mount head (APX Mobile photo, 439×192: radio from x 35–393, y 28–158).
const AM=photoBoxes(35,28,2.4);
function DashHead(p){
  const f=useFace(p,{layout:"apx-mobile"});
  const {at,dot}=AM;
  const {connected,state,muted,volume=7,onPower,onMute,onVolume}=p;
  const [ref,zoom]=useFit(859);
  return <div ref={ref} className="fx am" style={{"--apx-bright":0.55+f.brightness*0.15,zoom}}>
    <div className="am-sink" style={at(43,29,385,52)}><div className="am-bracket" style={{left:"30.4%",width:"36.8%"}}><i/></div></div>
    <div className="am-front" style={at(35,50,393,158)}/>
    <div className="fx-engrave" style={at(110,54,200,62)}>REPEATER NATION</div>
    <Inert className="am-module" style={at(37,53,85,156)}/>
    <Inert className="am-module" style={at(363,53,391,156)}/>
    <button type="button" className={"fx-round fx-power"+(connected?" on":"")} style={dot(48.3,76,15)} onClick={onPower} disabled={state==="connecting"} title={connected?"Power off (disconnect)":"Power on (connect)"}><Power strokeWidth={2.6}/></button>
    <Leds f={f} boxes={[at(63,67.3,74,69.5),at(63,74.5,74,76.7),at(63,81.7,74,83.9)]}/>
    <button type="button" className="fx-round" style={dot(69,97.7,14)} onClick={brightnessStep(f)} title="Display brightness">{O7Icon.sun}</button>
    <Inert className="fx-round" style={dot(45,108.3,11)}/>
    <Jack style={dot(57.5,132,40)}/>

    <div className="fx-bezel" style={at(92,64,228,131)}/>
    <div className="fx-screen" style={at(97,69,222,127)}><FaceDisplay p={p} f={f} menus={false} softRow={f.bottom.slice(0,4)} className="fx-display am-display"/></div>
    <Softkeys f={f} box={at} xs={[[97,125],[129,157],[162,189],[193,221]]} y={[136.7,152.7]}/>

    <div className="fx-hold" style={dot(259.3,82.7,42)}><Knob className="am-knob" angle={muted?-135:-135+volume*27} title={muted?"Volume (muted, click to unmute)":`Volume ${volume} (scroll to change, click to mute)`} onClick={onMute} onStep={dir=>onVolume?.(-dir)}/></div>
    <NavDiamond f={f} style={dot(259,128.3,44)}/>

    {O7_KEYS.map(([d,l],i)=>{const c=[[286.7,306.7],[310,331.7],[335,356.7]][i%3],r=[[66.7,81],[84.3,98.3],[101.7,115],[118.3,132.7]][i/3|0];
      return <button type="button" key={d} className="fx-key am-digit" style={at(c[0],r[0],c[1],r[1])} onClick={()=>f.pressKey(d)} aria-label={d}><b>{d}</b><small>{O7Icon[l]||l}</small></button>})}
    <button type="button" className="fx-key fx-pill fx-home" style={at(286.7,135,318.3,150)} onClick={f.goHome} title="Home">{O7Icon.home}</button>
    <button type="button" className="fx-key fx-pill" style={at(325,135,357.3,150)} onClick={()=>f.setView(v=>v==="who"?"home":"who")} title="Who's On">{O7Icon.laptop}</button>

    <Inert className="fx-emerg-ring" style={dot(376,76,20)}/>
    <div className="fx-emerg" style={dot(376,76,15)} title="Emergency (not used)" aria-hidden="true"/>
    <Inert className="fx-round" style={dot(379.3,108.3,11)}/>
  </div>
}

// Slim mobile head (APX 8500 E5 photo, 500×500: radio from x 9–490, y 181–319).
const E5=photoBoxes(9,181,1.83);
function SlimHead(p){
  const f=useFace(p,{layout:"e5"});
  const {at,dot}=E5;
  const {connected,state,muted,volume=7,onPower,onMute,onVolume}=p;
  const [ref,zoom]=useFit(880);
  return <div ref={ref} className="fx e5" style={{"--apx-bright":0.55+f.brightness*0.15,zoom}}>
    <div className="e5-body" style={at(10,182,490,318)}/>
    <Inert className="e5-seam" style={at(53,190,54,312)}/>
    <Inert className="e5-seam" style={at(445,190,446,312)}/>
    <div className="fx-engrave" style={at(190,182.3,310,187.5)}>REPEATER NATION</div>
    <Inert className="e5-power-well" style={dot(34,206,28)}/>
    <button type="button" className={"fx-round fx-power"+(connected?" on":"")} style={dot(34,206,22)} onClick={onPower} disabled={state==="connecting"} title={connected?"Power off (disconnect)":"Power on (connect)"}><Power strokeWidth={2.6}/></button>
    <Leds f={f} boxes={[at(47,219.5,63,222),at(47,228,63,230.5),at(47,236.8,63,239.3)]}/>
    <Screw style={dot(31.7,250,15)}/>
    <Jack style={dot(50,284.5,52)}/>
    <div className="fx-hold" style={dot(94,215,58)}><Knob className="e5-knob vol" angle={muted?-135:-135+volume*27} title={muted?"Volume (muted, click to unmute)":`Volume ${volume} (scroll to change, click to mute)`} onClick={onMute} onStep={dir=>onVolume?.(-dir)}/></div>
    <button type="button" className="fx-key fx-pill" style={at(86,250,118.3,269.3)} onClick={brightnessStep(f)} title="Display brightness">{O7Icon.sun}</button>
    <button type="button" className="fx-round e5-p" style={dot(107.3,291,23)} onClick={()=>f.setView(v=>v==="recent"?"home":"recent")} title="P: Recent">P</button>

    <div className="fx-bezel" style={at(135,196.7,361.7,276.5)}/>
    <div className="fx-screen" style={at(138,199.3,360,274.3)}><FaceDisplay p={p} f={f} menus={false} softRow={f.bottom} className="fx-display e5-display"/></div>
    <Softkeys f={f} box={at} xs={[[133.3,172.7],[181.7,220.7],[230,269],[277.3,316.7],[325.3,365]]} y={[288.3,306.7]}/>

    <div className="fx-hold" style={dot(404,215,58)}><Knob className="e5-knob chan" angle={f.channelIndex*30} title="Channel (click or scroll to change)" onClick={()=>f.stepChannel(1)} onStep={f.stepChannel}/></div>
    <NavDiamond f={f} style={dot(413.3,278.3,55)}/>
    <Inert className="fx-emerg-ring" style={dot(464,206,34)}/>
    <div className="fx-emerg" style={dot(464,206,25)} title="Emergency (not used)" aria-hidden="true"/>
    <Inert className="e5-blue" style={dot(455,236.7,5.5)}/>
    <Screw style={dot(468.3,250,15)}/>
    <button type="button" className="fx-round fx-home" style={dot(465,292.7,26)} onClick={f.goHome} title="Home">{O7Icon.home}</button>
  </div>
}

export function RadioFace({face=DEFAULT_FACE,...p}){
  if(face==="dash-head")return <DashHead {...p}/>;
  if(face==="slim-head")return <SlimHead {...p}/>;
  if(face==="touch-handheld")return <TouchHandheld {...p}/>;
  if(face==="keypad-handheld")return <KeypadHandheld {...p}/>;
  return <ControlHead {...p}/>;
}
