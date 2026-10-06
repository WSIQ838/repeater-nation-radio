import {useSyncExternalStore} from "react";

// Plugins: small add-ons people write and install from a file (Settings › Plugins).
//
// A plugin is one .js file that starts with a header saying who made it and what it may do:
//
//   // ==RepeaterNationPlugin==
//   // @id          my-plugin
//   // @name        My plugin
//   // @version     1.0
//   // @author      N0CALL
//   // @description What it does, in one line
//   // @permissions radio, sounds
//   // ==/RepeaterNationPlugin==
//
// Each enabled plugin runs inside its own sandboxed, invisible frame with no access to the
// app: no sign-in, no saved settings, no microphone, no recordings and no app commands. It
// can't reach the internet either unless it asked for "internet". It talks to the radio only
// through the `rn` object (see docs/plugins.md), and the app checks every request against the
// permissions the person agreed to when installing it.

const STORE="rn-plugins", DATA="rn-plugin-data:";
const MAX_CODE=200*1024, MAX_DATA=64*1024;

// What a plugin can ask for, in the words shown when installing it.
export const PERMISSIONS={
  radio:"See your zone and channel, when the radio turns on or off, and when you transmit",
  callsigns:"See who is talking on the channel and who is calling you",
  sounds:"Play beeps and add roger beeps to Settings › Radio features",
  display:"Show short messages on the radio's screen",
  panel:"Add a small panel with its own buttons under the radio",
  buttons:"Press radio buttons for you: channel, zone, volume, mute and scan (never push to talk)",
  internet:"Use the internet",
};
// Actions a plugin with "buttons" may run. PTT, power and calls are deliberately not here.
export const PLUGIN_ACTIONS=["channel_up","channel_down","zone_up","zone_down","volume_up","volume_down","mute","scan"];
// Which permission each event needs.
const EVENT_PERM={channel:"radio",power:"radio",transmit:"radio","talk-start":"callsigns","talk-end":"callsigns",call:"callsigns"};

const read=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}};

// Reads the header block. Throws a plain-words error when the file isn't a plugin.
export function parsePlugin(code){
  if(typeof code!=="string"||!code.trim())throw new Error("That file is empty.");
  if(code.length>MAX_CODE)throw new Error("That plugin is too big (over 200 KB).");
  const m=code.match(/==RepeaterNationPlugin==([\s\S]*?)==\/RepeaterNationPlugin==/);
  if(!m)throw new Error("That file isn't a Repeater Nation plugin (it has no plugin header).");
  const meta={};
  for(const line of m[1].split(/\r?\n/)){const f=line.match(/@(\w+)\s+(.*?)\s*$/);if(f)meta[f[1].toLowerCase()]=f[2]}
  const id=String(meta.id||"").toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id))throw new Error("The plugin's @id must be 2 to 41 letters, numbers or dashes.");
  if(!meta.name)throw new Error("The plugin has no @name.");
  const asked=String(meta.permissions||"").split(/[\s,]+/).map(s=>s.trim().toLowerCase()).filter(Boolean);
  const unknown=asked.filter(p=>!PERMISSIONS[p]);
  if(unknown.length)throw new Error(`The plugin asks for something this app doesn't offer: ${unknown.join(", ")}.`);
  return {id,name:meta.name.slice(0,60),version:(meta.version||"").slice(0,20),author:(meta.author||"").slice(0,60),description:(meta.description||"").slice(0,200),permissions:[...new Set(asked)]};
}

// ---- Installed list -------------------------------------------------------------------------

let installed=read(STORE,[]).filter(p=>p&&p.id&&typeof p.code==="string");
let snapshot={installed,panels:{},tones:[],errors:{}};
const listeners=new Set();
const publish=patch=>{snapshot={...snapshot,...patch};listeners.forEach(f=>f())};
const subscribe=f=>{listeners.add(f);return()=>listeners.delete(f)};
export const usePlugins=()=>useSyncExternalStore(subscribe,()=>snapshot);
const saveList=()=>{write(STORE,installed);publish({installed:[...installed]})};

export function installPlugin(code){
  const meta=parsePlugin(code);
  const p={...meta,code,enabled:true,installedAt:Date.now()};
  installed=installed.filter(x=>x.id!==meta.id).concat(p);
  saveList();restart(meta.id);
  return p;
}
export function setPluginEnabled(id,on){
  installed=installed.map(p=>p.id===id?{...p,enabled:!!on}:p);saveList();restart(id);
}
export function removePlugin(id){
  installed=installed.filter(p=>p.id!==id);saveList();stop(id);
  try{localStorage.removeItem(DATA+id)}catch{}
}
export const pluginInstalled=id=>installed.find(p=>p.id===id);

// ---- Running plugins ------------------------------------------------------------------------

// The radio screen fills these in (show a message, press a button, play a beep).
let host={flash:()=>{},action:()=>{},play:()=>{},state:{}};
export const setPluginHost=h=>{host=h};

const running=new Map();// id → {frame, plugin}
let container=null;

// The frame the plugin runs in. Its content security policy is fixed before the plugin's
// code runs and can't be loosened from inside, so "no internet" really means none.
function frameHtml(p){
  const net=p.permissions.includes("internet")?"https:":"'none'";
  const csp=`default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; connect-src ${net}; img-src data:; media-src data: blob:; style-src 'unsafe-inline'`;
  const code=JSON.stringify(p.code).replace(/</g,"\\u003c");
  const perms=JSON.stringify(p.permissions);
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><script>
(function(){
  for(const k of ["__TAURI__","__TAURI_INTERNALS__","__TAURI_IPC__","__TAURI_METADATA__","ipc"])try{delete window[k]}catch(e){}
  const parentWin=window.parent,handlers={},waiting={};let seq=0;
  const send=(type,data)=>parentWin.postMessage({rnPlugin:1,type,data},"*");
  const ask=(type,data)=>new Promise((ok,fail)=>{const id=++seq;waiting[id]={ok,fail};parentWin.postMessage({rnPlugin:1,type,data,id},"*")});
  window.addEventListener("message",e=>{
    if(e.source!==parentWin||!e.data||!e.data.rnHost)return;
    const m=e.data;
    if(m.reply){const w=waiting[m.reply];delete waiting[m.reply];if(w)m.error?w.fail(new Error(m.error)):w.ok(m.value);return}
    (handlers[m.event]||[]).slice().forEach(f=>{try{f(m.data)}catch(err){send("error",String(err&&err.message||err))}});
  });
  const rn=Object.freeze({
    permissions:${perms},
    on:(event,f)=>{(handlers[event]=handlers[event]||[]).push(f)},
    state:()=>ask("state"),
    playTones:steps=>send("play",steps),
    addRogerBeep:(id,label,steps)=>send("roger",{id,label,steps}),
    show:text=>send("show",String(text)),
    setPanel:panel=>send("panel",panel),
    press:action=>send("press",action),
    log:(...a)=>send("log",a.map(String).join(" ")),
    storage:Object.freeze({get:()=>ask("load"),set:value=>ask("save",value)}),
  });
  window.addEventListener("error",e=>send("error",String(e.message||e)));
  window.addEventListener("unhandledrejection",e=>send("error",String(e.reason&&e.reason.message||e.reason)));
  try{new Function("rn",${code})(rn)}catch(err){send("error",String(err&&err.message||err))}
})();
</script>`;
}

function start(p){
  if(typeof document==="undefined"||running.has(p.id))return;
  if(!container){container=document.createElement("div");container.hidden=true;container.setAttribute("aria-hidden","true");document.body.appendChild(container)}
  const frame=document.createElement("iframe");
  // allow-scripts only: no same-origin, so the frame can't read the app's storage or pages.
  frame.setAttribute("sandbox","allow-scripts");
  frame.setAttribute("title","Plugin "+p.name);
  frame.srcdoc=frameHtml(p);
  container.appendChild(frame);
  running.set(p.id,{frame,plugin:p});
}
function stop(id){
  const r=running.get(id);if(!r)return;
  running.delete(id);try{r.frame.remove()}catch{}
  const panels={...snapshot.panels};delete panels[id];
  const errors={...snapshot.errors};delete errors[id];
  publish({panels,errors,tones:snapshot.tones.filter(t=>t.plugin!==id)});
}
function restart(id){stop(id);const p=pluginInstalled(id);if(p?.enabled)start(p)}
export function startPlugins(){for(const p of installed)if(p.enabled)start(p)}
export function stopPlugins(){for(const id of [...running.keys()])stop(id)}

const has=(p,perm)=>p.permissions.includes(perm);
const toPlugin=(r,msg)=>{try{r.frame.contentWindow?.postMessage({rnHost:1,...msg},"*")}catch{}};

// Tells every running plugin that has permission for it that something happened.
export function emitPluginEvent(event,data){
  const need=EVENT_PERM[event];
  for(const r of running.values())if(!need||has(r.plugin,need))toPlugin(r,{event,data});
}

// A beep is a list of [frequency in Hz (0 = silence), milliseconds] pairs, up to 3 seconds.
export function cleanSteps(steps){
  if(!Array.isArray(steps)||!steps.length||steps.length>64)return null;
  let total=0;const out=[];
  for(const s of steps){
    const f=Number(Array.isArray(s)?s[0]:NaN),ms=Number(Array.isArray(s)?s[1]:NaN);
    if(!Number.isFinite(f)||!Number.isFinite(ms)||f<0||f>4000||ms<1||ms>2000)return null;
    total+=ms;out.push([Math.round(f),Math.round(ms)]);
  }
  return total<=3000?out:null;
}
const cleanText=(v,n)=>String(v??"").replace(/\s+/g," ").trim().slice(0,n);
function cleanPanel(v){
  if(!v)return null;
  const buttons=(Array.isArray(v.buttons)?v.buttons:[]).slice(0,8).map(b=>({id:cleanText(b?.id,40),label:cleanText(b?.label,30)})).filter(b=>b.id&&b.label);
  const lines=(Array.isArray(v.lines)?v.lines:v.text!=null?[v.text]:[]).slice(0,6).map(x=>cleanText(x,120)).filter(Boolean);
  return {title:cleanText(v.title,40),lines,buttons};
}
const logError=(id,text)=>{console.warn(`[plugin ${id}]`,text);publish({errors:{...snapshot.errors,[id]:cleanText(text,200)}})};

// A button on a plugin's panel was clicked.
export function pressPanelButton(id,button){const r=running.get(id);if(r)toPlugin(r,{event:"button",data:button})}

// Roger beeps plugins added, as "plugin:<plugin id>:<beep id>" in the Roger beep list.
export const pluginRogerSteps=id=>snapshot.tones.find(t=>t.id===id)?.steps||null;

if(typeof window!=="undefined")window.addEventListener("message",e=>{
  const m=e.data;if(!m||!m.rnPlugin)return;
  let r=null;for(const x of running.values())if(x.frame.contentWindow===e.source){r=x;break}
  if(!r)return;
  const p=r.plugin,reply=(value,error)=>m.id&&toPlugin(r,{reply:m.id,value,error});
  const denied=perm=>{logError(p.id,`Tried to use "${perm}" without permission.`);reply(undefined,`This plugin doesn't have the "${perm}" permission.`)};
  switch(m.type){
    case "log":console.info(`[plugin ${p.id}]`,String(m.data).slice(0,500));break;
    case "error":logError(p.id,m.data);break;
    case "state":{
      const s=host.state||{},out={};
      if(has(p,"radio"))Object.assign(out,{on:!!s.on,transmitting:!!s.transmitting,zone:s.zone||"",channel:s.channel||"",number:s.number??null});
      if(has(p,"callsigns"))out.talking=s.talking||"";
      reply(out);break;
    }
    case "load":reply(read(DATA+p.id,null));break;
    case "save":{
      let text="";try{text=JSON.stringify(m.data??null)}catch{return reply(undefined,"That can't be saved.")}
      if(text.length>MAX_DATA)return reply(undefined,"That's too much to save (over 64 KB).");
      reply(write(DATA+p.id,m.data??null));break;
    }
    case "play":{if(!has(p,"sounds"))return denied("sounds");const s=cleanSteps(m.data);if(s)host.play(s);else logError(p.id,"playTones got a beep it can't play.");break}
    case "roger":{
      if(!has(p,"sounds"))return denied("sounds");
      const s=cleanSteps(m.data?.steps),key=cleanText(m.data?.id,30),label=cleanText(m.data?.label,30);
      if(!s||!key||!label){logError(p.id,"addRogerBeep needs an id, a label and a beep.");break}
      const id=`plugin:${p.id}:${key}`;
      publish({tones:snapshot.tones.filter(t=>t.id!==id).concat({id,label:`${label} (${p.name})`,steps:s,plugin:p.id})});break;
    }
    case "show":if(!has(p,"display"))return denied("display");host.flash(cleanText(m.data,40));break;
    case "panel":{
      if(!has(p,"panel"))return denied("panel");
      const panels={...snapshot.panels};const v=cleanPanel(m.data);
      if(v)panels[p.id]=v;else delete panels[p.id];
      publish({panels});break;
    }
    case "press":if(!has(p,"buttons"))return denied("buttons");if(PLUGIN_ACTIONS.includes(m.data))host.action(m.data);else logError(p.id,`"${m.data}" isn't a button plugins can press.`);break;
  }
});
