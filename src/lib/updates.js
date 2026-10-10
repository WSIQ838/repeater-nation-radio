import {useEffect,useState} from "react";
import {openUrl} from "@tauri-apps/plugin-opener";
import {fetch as tauriFetch} from "@tauri-apps/plugin-http";

// Update checks: one shared state, so the Settings widget, the pop-up and the automatic
// checks always agree on what was last found.
const UPDATE_FEED="https://api.github.com/repos/WSIQ838/repeater-nation-radio/releases?per_page=20";
const EVERY_KEY="rn-update-every", SKIP_KEY="rn-update-skip", LAST_KEY="rn-update-last";
const HOUR=3600_000;
// How often the radio looks for a new version on its own. Every choice except "never"
// also checks once when the app opens.
export const UPDATE_EVERY=[
  {id:"never",label:"Never (only when I press Check now)"},
  {id:"startup",label:"When the app opens"},
  {id:"1h",label:"Every hour",ms:HOUR},
  {id:"6h",label:"Every 6 hours",ms:6*HOUR},
  {id:"24h",label:"Once a day",ms:24*HOUR},
  {id:"168h",label:"Once a week",ms:168*HOUR},
];
const DEFAULT_EVERY="6h";
// An iPhone can't install a release from GitHub, so it doesn't check on its own or pop up.
export const CAN_INSTALL_UPDATES=!(typeof navigator!=="undefined"&&/iPhone|iPad|iPod/i.test(navigator.userAgent||""));

const read=key=>{try{return localStorage.getItem(key)}catch{return null}};
const write=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
export const loadUpdateEvery=()=>{const v=read(EVERY_KEY);return UPDATE_EVERY.some(x=>x.id===v)?v:DEFAULT_EVERY};
export const saveUpdateEvery=v=>{write(EVERY_KEY,v);emit()};
export const skippedVersion=()=>read(SKIP_KEY)||"";
export const skipVersion=v=>{write(SKIP_KEY,v);emit()};
const lastCheck=()=>Number(read(LAST_KEY))||0;

const parse=v=>String(v||"").replace(/^radio-v/i,"").split(".").map(x=>parseInt(x,10)||0);
const newer=(a,b)=>{const x=parse(a),y=parse(b);return y[0]>x[0]||(y[0]===x[0]&&(y[1]>x[1]||(y[1]===x[1]&&y[2]>x[2])))};

// Turn a failed update check into what actually went wrong. GitHub answers 404 for a
// private repository, so that is not "offline".
function describeUpdateError(r){
  if(!r)return {pill:"OFFLINE",title:"Update check failed",detail:"Could not reach GitHub. Check your internet connection and try again."};
  if(r.status===404)return {pill:"UNAVAILABLE",title:"Updates can't be checked",detail:"The release page for this app isn't public, so the app can't see new versions."};
  const left=r.headers?.get?.("x-ratelimit-remaining"),reset=Number(r.headers?.get?.("x-ratelimit-reset"));
  if(r.status===429||(r.status===403&&left==="0")){
    const at=reset?new Date(reset*1000).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"";
    return {pill:"LIMITED",title:"Too many update checks",detail:"GitHub's hourly limit was reached"+(at?". Try again after "+at+".":". Try again later.")};
  }
  return {pill:"ERROR",title:"Update check failed",detail:"GitHub answered with error "+r.status+". Try again later."};
}

// status: idle, checking, current, available or error. seq counts finished checks, so the
// pop-up can tell a new finding from one already dismissed.
let state={status:"idle",release:null,failure:null,seq:0,auto:false};
const subs=new Set();
function emit(){for(const f of subs)f({...state})}
function set(next){state={...state,...next};emit()}

let running=null;
export function checkForUpdates({auto=false}={}){
  if(running)return running;
  set({status:"checking"});
  // Counted from when a check starts, so a failing check (offline) isn't retried every minute.
  write(LAST_KEY,String(Date.now()));
  running=(async()=>{
    let r=null;
    try{
      try{r=await tauriFetch(UPDATE_FEED,{headers:{Accept:"application/vnd.github+json"}})}catch(e){console.error("[update]",e);r=null}
      if(!r?.ok)throw new Error("Update service returned "+(r?.status??"no response"));
      const releases=await r.json();
      const data=(Array.isArray(releases)?releases:[])
        .filter(x=>!x.draft&&/^radio-v\d+\.\d+\.\d+$/i.test(String(x.tag_name||"")))
        .sort((a,b)=>newer(a.tag_name,b.tag_name)?1:newer(b.tag_name,a.tag_name)?-1:0)[0];
      const version=data?String(data.tag_name).replace(/^radio-v/i,""):"";
      if(data&&newer(String(__APP_VERSION__),version))set({status:"available",release:{...data,version},failure:null,seq:state.seq+1,auto});
      else set({status:"current",release:null,failure:null,seq:state.seq+1,auto});
    }catch(e){
      console.error("[update]",e);
      set({status:"error",failure:describeUpdateError(r?.ok?{status:"bad data"}:r),seq:state.seq+1,auto});
    }finally{running=null}
  })();
  return running;
}

export function useUpdateState(){
  const [s,setS]=useState(()=>({...state}));
  useEffect(()=>{subs.add(setS);setS({...state});return()=>{subs.delete(setS)}},[]);
  return s;
}

// The installer for this computer when it can be told apart, otherwise the release page.
export function openRelease(release){
  const ua=typeof navigator!=="undefined"?navigator.userAgent||"":"";
  const assets=release?.assets||[];
  const asset=/Windows/i.test(ua)?assets.find(a=>/\.exe$/i.test(a.name)):/Android/i.test(ua)?assets.find(a=>/\.apk$/i.test(a.name)):null;
  return openUrl(asset?.browser_download_url||release?.html_url||"https://github.com/WSIQ838/repeater-nation-radio/releases");
}

// Runs the automatic checks: once when the app opens (unless set to never), then on the
// chosen schedule. The time of the last check is kept, so restarting the app doesn't
// reset an hourly or daily schedule.
export function useAutoUpdateCheck(){
  const [every,setEvery]=useState(loadUpdateEvery);
  useEffect(()=>{const f=()=>setEvery(loadUpdateEvery());subs.add(f);return()=>{subs.delete(f)}},[]);
  useEffect(()=>{if(CAN_INSTALL_UPDATES&&every!=="never")checkForUpdates({auto:true})},[]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    const ms=UPDATE_EVERY.find(x=>x.id===every)?.ms;
    if(!CAN_INSTALL_UPDATES||!ms)return;
    const tick=()=>{if(Date.now()-lastCheck()>=ms)checkForUpdates({auto:true})};
    const id=setInterval(tick,60_000);
    return()=>clearInterval(id);
  },[every]);
}
