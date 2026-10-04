// Radio alert tones made with Web Audio, so they work the same on Windows, macOS and Linux.
let ctx=null;
export const audio=()=>{
  if(typeof window==="undefined")return null;
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
  if(!ctx)ctx=new AC();
  if(ctx.state==="suspended")ctx.resume().catch(()=>{});
  return ctx;
};

// Each step is [frequency Hz (0 = silence), milliseconds].
const PATTERNS={
  permit:[[1200,60],[0,25],[1500,60]],          // talk permit: floor granted, start talking
  busy:[[480,140],[0,90],[480,140],[0,90],[480,140]], // channel busy / floor denied
  roger:[[1050,90],[0,30],[1400,120]],          // end of a received transmission
  tot:[[880,90],[0,60],[880,90],[0,60],[880,90]], // time-out timer about to key you off
  timeout:[[660,350]],                          // time-out timer keyed you off
  error:[[330,250]],
};

// Roger beep choices for the end of each received transmission ("off" plays nothing).
export const ROGER_TONES=[
  {id:"off",label:"Off"},
  {id:"classic",label:"Two-tone up",steps:PATTERNS.roger},
  {id:"down",label:"Two-tone down",steps:[[1400,90],[0,30],[1050,120]]},
  {id:"single",label:"Single beep",steps:[[1000,160]]},
  {id:"chirp",label:"Double chirp",steps:[[1900,45],[0,25],[1900,45]]},
  {id:"triple",label:"Triple beep",steps:[[1250,55],[0,40],[1250,55],[0,40],[1250,55]]},
  {id:"morse-k",label:"Morse K (– · –)",steps:[[800,180],[0,60],[800,60],[0,60],[800,180]]},
  {id:"data",label:"Data burst",steps:Array.from({length:14},(_,i)=>[i%3===1?1200:1800,16])},
  {id:"low",label:"Low bloop",steps:[[620,70],[0,20],[470,140]]},
];
export const rogerSteps=id=>ROGER_TONES.find(t=>t.id===id)?.steps||PATTERNS.roger;

export function playTone(name,volume=0.6,steps0=null){
  const ac=audio(),steps=steps0||PATTERNS[name];if(!ac||!steps||volume<=0)return;
  let t=ac.currentTime+0.01;
  for(const [freq,ms] of steps){
    const d=ms/1000;
    if(freq){
      const osc=ac.createOscillator(),gain=ac.createGain();
      osc.type="sine";osc.frequency.value=freq;
      gain.gain.setValueAtTime(0,t);
      gain.gain.linearRampToValueAtTime(0.25*volume,t+0.005);
      gain.gain.setValueAtTime(0.25*volume,t+d-0.01);
      gain.gain.linearRampToValueAtTime(0,t+d);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);osc.stop(t+d+0.02);
    }
    t+=d;
  }
}

// Spoken channel announcements where the WebView has speech synthesis. opts picks
// the voice (by voiceURI, from the voices installed on the computer), speed and pitch.
export function announce(text,{voice="",rate=1.05,pitch=1}={}){
  try{
    const s=window.speechSynthesis;if(!s||!text)return false;
    s.cancel();
    const u=new SpeechSynthesisUtterance(text);u.rate=rate;u.pitch=pitch;
    const v=voice&&s.getVoices().find(x=>x.voiceURI===voice);
    if(v){u.voice=v;u.lang=v.lang}
    s.speak(u);
    return true;
  }catch{return false}
}
// The computer's voices; they load late in some browsers, so watch voiceschanged too.
export function listVoices(onChange){
  const s=typeof window!=="undefined"&&window.speechSynthesis;if(!s)return()=>{};
  const send=()=>{try{onChange(s.getVoices().map(v=>({id:v.voiceURI,name:v.name,lang:v.lang,local:v.localService})))}catch{}};
  send();s.addEventListener?.("voiceschanged",send);
  return()=>s.removeEventListener?.("voiceschanged",send);
}
export const canAnnounce=()=>typeof window!=="undefined"&&!!window.speechSynthesis;

// Saved radio feature settings.
const KEY="rn-features";
export const FEATURE_DEFAULTS={permitTone:true,busyTone:true,rogerBeep:true,rogerTone:"classic",tot:60,announce:false,announceVoice:"",announceRate:1.05,announcePitch:1,voiceFx:"clean",toneVolume:0.6,notifyCalls:true,notifyTalk:false,closeToTray:false};
const VALID_TOT=new Set([0,30,60,120,180]);
export function loadFeatures(){
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)||"{}")||{};
    const merged={...FEATURE_DEFAULTS,...saved};
    const parsedTot=Number(merged.tot);
    // Older test builds could leave an unsupported value such as 3 seconds
    // in localStorage. Never let an invalid saved value become a hidden
    // auto-release timer; fall back to the normal 60-second default.
    merged.tot=VALID_TOT.has(parsedTot)?parsedTot:FEATURE_DEFAULTS.tot;
    if(merged.tot!==saved.tot)try{localStorage.setItem(KEY,JSON.stringify(merged))}catch{}
    return merged;
  }catch{return {...FEATURE_DEFAULTS}}
}
export function saveFeatures(f){try{localStorage.setItem(KEY,JSON.stringify(f))}catch{}}

// Per-channel volume (0–10), remembered like a real radio's channel memory.
const VKEY="rn-volume";
export function loadVolumes(){try{return JSON.parse(localStorage.getItem(VKEY)||"{}")||{}}catch{return {}}}
export function saveVolumes(v){try{localStorage.setItem(VKEY,JSON.stringify(v))}catch{}}
// Hearing is logarithmic, so a straight 0-1 scale barely changes between 10 and 5. A squared
// curve makes every knob detent an audible step (level 5 is a quarter of full gain).
export const volumeGain=level=>{const v=Math.max(0,Math.min(10,Number(level)||0))/10;return v*v};
export const DEFAULT_VOLUME=7;
