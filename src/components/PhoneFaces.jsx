import {zoneLabel} from "../lib/labels";

// Extra full-screen looks for the phone app, picked under More › Radio. Each draws only the
// screen above the phone's PTT and volume keys; the keys take the face's colours from the
// "face-<id>" class on the phone shell (phone.css).
export const PHONE_FACES=[
  {id:"lcd",label:"Classic LCD",note:"Amber screen, big channel number, softkeys and channel rocker"},
  {id:"glove",label:"Glove mode",note:"Huge yellow buttons and a giant red PTT"},
  {id:"night",label:"Night mode",note:"Red on black to keep your night vision"},
  {id:"scanner",label:"Scanner list",note:"Every channel in the zone, lit when someone talks"},
];

// c: what PhoneApp already worked out (zone, chan, activity, tone, tx, rx, last, step, go, p).
export function PhoneFaceBody({face,c}){
  const {p,zone,chan,activity,tone,tx,rx,last,step,go}=c;
  const zoneName=zoneLabel(zone?.name||""),chanName=p.channelName||chan?.name||"";
  const talker=tx?(p.callsign||"You"):rx?p.onAir.name:"";
  const scanKey=<button type="button" onClick={p.onScan||undefined} disabled={!p.onScan} className={p.scanning?"on":""}>Scan</button>;

  if(face==="lcd")return <div className="pf pf-lcd">
    <div className="pf-badge">REPEATER NATION</div>
    <div className="pf-lcdscreen">
      <div className="pf-row"><span>{p.connected?"▮▮▮▮":"▯▯▯▯"} {p.muted?"MUTE":"VOL "+p.volume}</span><span>{p.scanning?"SCAN":""}</span></div>
      <button type="button" className="pf-big" onClick={()=>go("channels")}>CH {String(chan?.number??"--").padStart(2,"0")}</button>
      <button type="button" className="pf-name" onClick={()=>go("zones")}>{chanName.toUpperCase()}</button>
      <div className="pf-act">{talker?(tx?"TX · ":"RX · ")+talker:activity.toUpperCase()}</div>
    </div>
    <div className="pf-soft"><button type="button" onClick={()=>go("zones")}>Zone</button>{scanKey}<button type="button" onClick={()=>go("contacts")}>Contacts</button></div>
    <div className="pf-rock"><button type="button" onClick={()=>step(-1)}>◀ CH</button><button type="button" onClick={()=>step(1)}>CH ▶</button></div>
    <div className="pf-soft"><button type="button" onClick={()=>go("status")}>Status</button><button type="button" onClick={()=>last&&p.onReplay(last.id)} disabled={!last?.url}>Replay</button><button type="button" onClick={()=>go("more")}>Menu</button></div>
  </div>;

  if(face==="glove")return <div className="pf pf-glove">
    <button type="button" className="pf-ch" onClick={()=>go("channels")}><small>{zoneName.toUpperCase()}</small><strong>{chanName}</strong><span className={tone}>● {talker?(tx?"Talking":talker):activity}</span></button>
    <div className="pf-pair"><button type="button" onClick={()=>step(-1)}>◀ CH</button><button type="button" onClick={()=>step(1)}>CH ▶</button></div>
    <div className="pf-pair alt">{scanKey}<button type="button" onClick={()=>go("more")}>Menu</button></div>
  </div>;

  if(face==="night")return <div className="pf pf-night">
    <button type="button" className="pf-z" onClick={()=>go("zones")}>{zoneName.toUpperCase()}</button>
    <button type="button" className="pf-n" onClick={()=>go("channels")}>{chanName}</button>
    <div className="pf-who"><span>{talker?(tx?"TX · ":"RX · ")+talker:activity}</span></div>
    <div className="pf-meter">{[1,2,3,4,5,6].map(n=><i key={n} className={(tx||rx)&&n<=4?"on":""} style={{height:(30+n*12)+"%"}}/>)}</div>
    <div className="pf-line"/>
    <div className="pf-who dim"><span>{last?"Last: "+last.name:"Nothing heard yet"}</span><span>{last?new Date(last.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):""}</span></div>
    <div className="pf-keys"><button type="button" onClick={()=>go("zones")}>Zone</button>{scanKey}<button type="button" onClick={()=>go("who")}>Who</button><button type="button" onClick={()=>go("more")}>Menu</button></div>
  </div>;

  // Scanner list
  const live=name=>p.scanActive&&p.scanActive===name;
  return <div className="pf pf-scan">
    <button type="button" className="pf-h" onClick={()=>go("zones")}>{zoneName.toUpperCase()}{p.scanning?" · SCANNING":""}</button>
    <div className="pf-list">{p.visibleChannels.length?p.visibleChannels.map(ch=>{
      const sel=ch.id===p.channelId,on=live(ch.name)||(sel&&(rx||tx));
      return <button type="button" key={ch.id} className={"pf-r"+(sel?" sel":"")+(on?" live":"")} onClick={()=>p.onChannel(ch.id)}>
        <span className="pf-num">{ch.number}</span>
        <span className="pf-g"><b>{ch.name}</b><small>{on?(sel&&talker?talker+" talking":"Someone talking"):sel?(p.connected?(p.participants||[]).length+" on · selected":"Selected"):"Tap to switch"}</small></span>
        <span className="pf-bars">{[1,2,3,4].map(n=><i key={n} className={on?"on":""} style={{height:(n*25)+"%"}}/>)}</span>
      </button>})
      :<div className="pf-empty">No channels yet</div>}</div>
    <div className="pf-foot">{scanKey}<button type="button" onClick={()=>go("more")}>Menu</button></div>
  </div>;
}
