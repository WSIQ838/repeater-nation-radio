// Voice filters: radio-style sound for what you hear on the radio, scan and the Console.
// "clean" plays the received audio untouched. The others run it through Web Audio
// (band-pass, saturation, compression) into a stream that the same audio element
// plays, so the volume, mute and speaker choice keep working as before.
import {audio} from "./tones";
import {micError} from "./livekit";

export const VOICE_FX=[
  {id:"clean",label:"Clean (no filter)"},
  {id:"fm",label:"Analog FM"},
  {id:"p25",label:"Digital P25"},
  {id:"am",label:"Old AM"},
  {id:"scanner",label:"Police scanner"},
];

// A smooth saturation curve (k = drive), or a stepped one that mimics a low-bit codec.
const curve=(k,steps=0)=>{const n=1024,c=new Float32Array(n);for(let i=0;i<n;i++){let x=i*2/n-1;if(steps)x=Math.round(x*steps)/steps;c[i]=k?(1+k)*x/(1+k*Math.abs(x)):x}return c};
const biquad=(ac,type,frequency,Q=0.7,gain=0)=>{const f=ac.createBiquadFilter();f.type=type;f.frequency.value=frequency;f.Q.value=Q;f.gain.value=gain;return f};
const shaper=(ac,k,steps=0)=>{const w=ac.createWaveShaper();w.curve=curve(k,steps);w.oversample="2x";return w};
const comp=(ac,threshold=-24,ratio=4)=>{const c=ac.createDynamicsCompressor();c.threshold.value=threshold;c.ratio.value=ratio;c.attack.value=0.004;c.release.value=0.15;return c};
const level=(ac,v)=>{const g=ac.createGain();g.gain.value=v;return g};

// "Digital P25" rebuilds the voice the way a P25 radio's voice coder does (p25-worklet.js).
// The worklet loads once per audio context; until it has, or where a webview can't run
// one, P25 falls back to a filter-only imitation.
const p25Ready=new WeakMap();
function loadP25(ac){
  if(!p25Ready.has(ac)){
    const p=ac.audioWorklet?ac.audioWorklet.addModule(new URL("./p25-worklet.js",import.meta.url)).then(()=>true,()=>false):Promise.resolve(false);
    p25Ready.set(ac,p);p.then(ok=>{p25Ready.set(ac,ok);if(ok&&current==="p25")live.forEach(wire)});
  }
  return Promise.resolve(p25Ready.get(ac));
}
function p25Chain(ac){
  if(p25Ready.get(ac)!==true){loadP25(ac);return null}
  try{
    const coder=new AudioWorkletNode(ac,"p25-voice",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:"explicit"});
    // Band-limit to the radio's 8 kHz audio on the way in, smooth it on the way out,
    // then the small speaker's low cut and a little presence.
    return [biquad(ac,"highpass",200,0.7),biquad(ac,"lowpass",3500,0.7),biquad(ac,"lowpass",3500,0.7),coder,
      biquad(ac,"lowpass",3700,0.7),biquad(ac,"lowpass",3700,0.7),biquad(ac,"highpass",300,0.7),biquad(ac,"peaking",2000,1,2),comp(ac,-24,4),level(ac,2)];
  }catch{return null}
}

// Each preset is a chain of nodes, wired in order.
function build(ac,id){
  if(id==="p25"){const chain=p25Chain(ac);if(chain)return chain}
  if(id==="fm")return [biquad(ac,"highpass",300),biquad(ac,"lowpass",3000),biquad(ac,"peaking",2200,1,2),shaper(ac,2),comp(ac,-26,3),level(ac,0.9)];
  if(id==="p25")return [biquad(ac,"highpass",420,0.9),biquad(ac,"lowpass",3100,0.9),biquad(ac,"peaking",1700,1.2,4),shaper(ac,1.5,9),comp(ac,-30,6),level(ac,0.85)];
  if(id==="am")return [biquad(ac,"highpass",550,1),biquad(ac,"lowpass",2300,1.1),biquad(ac,"peaking",1200,0.8,5),shaper(ac,8),comp(ac,-20,8),level(ac,0.7)];
  if(id==="scanner")return [biquad(ac,"highpass",650,1.2),biquad(ac,"lowpass",2800,1.4),biquad(ac,"peaking",1900,2,7),shaper(ac,4),comp(ac,-28,10),level(ac,0.75)];
  return [];
}

// For rendering samples offline (scripts/voicefx-samples): the chain for one preset,
// waiting for the P25 coder to load first.
export async function voiceChain(ac,id){if(id==="p25")await loadP25(ac);return build(ac,id)}

const KEY="rn-voice-fx";
let current=(()=>{try{const v=localStorage.getItem(KEY);return VOICE_FX.some(f=>f.id===v)?v:"clean"}catch{return "clean"}})();
const live=new Set();
export const voiceFx=()=>current;

function wire(fx){
  // Undo any earlier routing first.
  if(fx.nodes){try{fx.src.disconnect()}catch{}fx.nodes.forEach(n=>{try{n.disconnect()}catch{}});fx.nodes=null}
  const ac=current==="clean"?null:audio();
  if(!ac||!fx.raw){
    if(fx.el.srcObject!==fx.raw&&fx.raw){fx.el.srcObject=fx.raw;fx.el.play?.().catch(()=>{})}
    if(fx.keep){fx.keep.pause();fx.keep.srcObject=null;fx.keep=null}
    return;
  }
  try{
    fx.src||=ac.createMediaStreamSource(fx.raw);
    fx.dest||=ac.createMediaStreamDestination();
    const nodes=build(ac,current);
    let at=fx.src;for(const n of nodes){at.connect(n);at=n}at.connect(fx.dest);
    fx.nodes=nodes;
    // Chrome only feeds a remote WebRTC stream into Web Audio while an element is
    // playing it, so a silent element keeps it flowing.
    if(!fx.keep){fx.keep=new Audio();fx.keep.muted=true;fx.keep.srcObject=fx.raw;fx.keep.play().catch(()=>{})}
    if(fx.el.srcObject!==fx.dest.stream){fx.el.srcObject=fx.dest.stream;fx.el.play?.().catch(()=>{})}
  }catch{
    // Web Audio refused this stream: fall back to the untouched audio.
    fx.nodes=null;if(fx.raw&&fx.el.srcObject!==fx.raw){fx.el.srcObject=fx.raw;fx.el.play?.().catch(()=>{})}
  }
}

// Use in place of track.attach() for received radio audio.
export function attachVoice(track){
  const el=track.attach();
  const fx={el,raw:el.srcObject||null,src:null,dest:null,nodes:null,keep:null};
  live.add(fx);
  if(current!=="clean")wire(fx);
  const remove=el.remove.bind(el);
  el.remove=()=>{live.delete(fx);if(fx.nodes){try{fx.src.disconnect()}catch{}fx.nodes.forEach(n=>{try{n.disconnect()}catch{}})}if(fx.keep){fx.keep.pause();fx.keep.srcObject=null}remove()};
  return el;
}

// Switch every playing stream to another filter straight away.
export function setVoiceFx(id){
  if(id==="p25"){const ac=audio();if(ac)loadP25(ac)}
  if(!VOICE_FX.some(f=>f.id===id))return;
  current=id;try{localStorage.setItem(KEY,id)}catch{}
  live.forEach(wire);
}

// A short test: a voice-like buzz through the chosen filter, so it can be heard
// without anyone talking.
export async function previewVoiceFx(id,volume=0.6){
  const ac=audio();if(!ac)return;
  if(id==="p25")await loadP25(ac);
  const t=ac.currentTime+0.02,d=1.2;
  const osc=ac.createOscillator();osc.type="sawtooth";
  osc.frequency.setValueAtTime(140,t);osc.frequency.linearRampToValueAtTime(190,t+0.4);osc.frequency.linearRampToValueAtTime(120,t+0.9);osc.frequency.linearRampToValueAtTime(160,t+d);
  // Two moving formants make the buzz sound like vowels.
  const f1=biquad(ac,"bandpass",700,4),f2=biquad(ac,"bandpass",1200,5);
  f1.frequency.setValueAtTime(700,t);f1.frequency.linearRampToValueAtTime(300,t+0.5);f1.frequency.linearRampToValueAtTime(650,t+d);
  f2.frequency.setValueAtTime(1200,t);f2.frequency.linearRampToValueAtTime(2300,t+0.5);f2.frequency.linearRampToValueAtTime(1000,t+d);
  const mix=level(ac,1),env=ac.createGain();
  env.gain.setValueAtTime(0,t);env.gain.linearRampToValueAtTime(0.5*volume,t+0.05);env.gain.setValueAtTime(0.5*volume,t+d-0.1);env.gain.linearRampToValueAtTime(0,t+d);
  osc.connect(f1);osc.connect(f2);f1.connect(mix);f2.connect(mix);
  const nodes=build(ac,id);let at=mix;for(const n of nodes){at.connect(n);at=n}at.connect(env).connect(ac.destination);
  osc.start(t);osc.stop(t+d+0.05);
  osc.onended=()=>{[osc,f1,f2,mix,env,...nodes].forEach(n=>{try{n.disconnect()}catch{}})};
}

// Test with your own voice: record up to `seconds` from the mic, then play it back
// through the chosen filter. It plays afterwards rather than live, so speakers can't
// feed back into the mic. onState gets "recording", "playing", "done" or an error text.
// Returns stop(): while recording it ends the recording and plays it back.
export function micTestVoiceFx(id,deviceId,volume,onState,seconds=6){
  let rec=null,stream=null,timer=null,src=null,cancelled=false;
  const finish=msg=>{clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());onState(msg)};
  (async()=>{
    const ac=audio();
    if(!ac||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")return finish("Testing with the mic isn't possible here.");
    try{stream=await navigator.mediaDevices.getUserMedia({audio:{...(deviceId?{deviceId:{ideal:deviceId}}:{}),echoCancellation:true,noiseSuppression:true,autoGainControl:true}})}
    catch(err){return finish(micError(err)?.message||"The microphone couldn't open.")}
    if(cancelled)return finish("done");
    const parts=[];rec=new MediaRecorder(stream);
    rec.ondataavailable=e=>{if(e.data?.size)parts.push(e.data)};
    rec.onstop=async()=>{
      stream.getTracks().forEach(t=>t.stop());clearTimeout(timer);
      if(cancelled||!parts.length)return onState("done");
      try{
        const buf=await ac.decodeAudioData(await new Blob(parts,{type:rec.mimeType}).arrayBuffer());
        if(cancelled)return onState("done");
        src=ac.createBufferSource();src.buffer=buf;
        const out=level(ac,volume),nodes=await voiceChain(ac,id);
        let at=src;for(const n of nodes){at.connect(n);at=n}at.connect(out).connect(ac.destination);
        src.onended=()=>{[src,out,...nodes].forEach(n=>{try{n.disconnect()}catch{}});onState("done")};
        onState("playing");src.start();
      }catch{onState("The recording couldn't be played back.")}
    };
    rec.start();onState("recording");
    timer=setTimeout(()=>{if(rec?.state==="recording")rec.stop()},seconds*1000);
  })();
  return ()=>{
    if(rec?.state==="recording"){rec.stop();return}
    cancelled=true;try{src?.stop()}catch{}finish("done");
  };
}
