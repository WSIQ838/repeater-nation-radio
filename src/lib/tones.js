// Radio alert tones made with Web Audio, so they work the same on Windows, macOS and Linux.
let ctx=null;
const audio=()=>{
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

export function playTone(name,volume=0.6){
  const ac=audio(),steps=PATTERNS[name];if(!ac||!steps||volume<=0)return;
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

// Spoken channel announcements where the WebView has speech synthesis.
export function announce(text){
  try{
    const s=window.speechSynthesis;if(!s||!text)return false;
    s.cancel();
    const u=new SpeechSynthesisUtterance(text);u.rate=1.05;s.speak(u);
    return true;
  }catch{return false}
}
export const canAnnounce=()=>typeof window!=="undefined"&&!!window.speechSynthesis;

// Saved radio feature settings.
const KEY="rn-features";
export const FEATURE_DEFAULTS={permitTone:true,busyTone:true,rogerBeep:true,tot:60,announce:false,toneVolume:0.6};
export function loadFeatures(){try{return {...FEATURE_DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return {...FEATURE_DEFAULTS}}}
export function saveFeatures(f){try{localStorage.setItem(KEY,JSON.stringify(f))}catch{}}

// Per-channel volume (0–10), remembered like a real radio's channel memory.
const VKEY="rn-volume";
export function loadVolumes(){try{return JSON.parse(localStorage.getItem(VKEY)||"{}")||{}}catch{return {}}}
export function saveVolumes(v){try{localStorage.setItem(VKEY,JSON.stringify(v))}catch{}}
export const DEFAULT_VOLUME=7;
