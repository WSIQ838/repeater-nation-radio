// Traffic recorder: every transmission heard (selected, scanned and console channels)
// and sent is saved on this PC in IndexedDB, with a playback log. Old recordings are
// pruned by age and by total size.
const DB="rn-traffic",STORE="tx",SETTINGS_KEY="rn-traffic-settings";
export const TRAFFIC_DEFAULTS={enabled:true,days:7,maxMB:300};
export const MIN_RECORD_MS=400;

export function loadTrafficSettings(){try{return {...TRAFFIC_DEFAULTS,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}")}}catch{return {...TRAFFIC_DEFAULTS}}}
export function saveTrafficSettings(v){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(v))}catch{}}

let dbPromise=null;
function db(){
  if(typeof indexedDB==="undefined")return Promise.reject(new Error("Recording isn't available on this system."));
  return dbPromise||(dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{const s=req.result.createObjectStore(STORE,{keyPath:"id"});s.createIndex("at","at")};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>{dbPromise=null;reject(req.error)};
  }));
}
const done=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
const txDone=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error)});

const listeners=new Set();
export function onTrafficChange(fn){listeners.add(fn);return()=>listeners.delete(fn)}
const changed=()=>listeners.forEach(fn=>{try{fn()}catch{}});

// Record one audio track until the returned stop() is called. stop() resolves to
// {blob, mime} or null when nothing was captured.
export function recordTrack(mediaStreamTrack){
  if(typeof MediaRecorder==="undefined"||!mediaStreamTrack)return {stop:async()=>null};
  let rec;const chunks=[];
  try{rec=new MediaRecorder(new MediaStream([mediaStreamTrack]));rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};rec.start()}catch{return {stop:async()=>null}}
  return {stop:()=>new Promise(resolve=>{
    const finish=()=>resolve(chunks.length?{blob:new Blob(chunks,{type:rec.mimeType||"audio/webm"}),mime:rec.mimeType||"audio/webm"}:null);
    if(rec.state==="inactive")return finish();
    rec.onstop=finish;try{rec.stop()}catch{finish()}
  })};
}

// entry: {at, ms, channelId, channel, zone, name, own, blob}
export async function saveTransmission(entry){
  const settings=loadTrafficSettings();
  if(!settings.enabled||!entry?.blob||entry.ms<MIN_RECORD_MS)return;
  const d=await db();
  const item={id:entry.at+":"+(entry.channelId||"")+":"+(entry.name||""),at:entry.at,ms:entry.ms,channelId:entry.channelId||"",channel:entry.channel||"",zone:entry.zone||"",name:entry.name||"Member",own:!!entry.own,blob:entry.blob,size:entry.blob.size};
  const tx=d.transaction(STORE,"readwrite");tx.objectStore(STORE).put(item);await txDone(tx);
  await prune(settings);changed();
}

// Newest first, without the audio (load it with getAudio when played).
export async function listTraffic(){
  const d=await db();
  const all=await done(d.transaction(STORE).objectStore(STORE).index("at").getAll());
  return all.reverse().map(({blob,...rest})=>rest);
}
export async function getAudio(id){const d=await db();return (await done(d.transaction(STORE).objectStore(STORE).get(id)))?.blob||null}
export async function deleteTraffic(id){const d=await db();const tx=d.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);await txDone(tx);changed()}
export async function clearTraffic(){const d=await db();const tx=d.transaction(STORE,"readwrite");tx.objectStore(STORE).clear();await txDone(tx);changed()}

// Drop recordings older than the retention period, then the oldest until under the size cap.
export async function prune(settings=loadTrafficSettings()){
  const d=await db();
  const all=await done(d.transaction(STORE).objectStore(STORE).index("at").getAll());
  const cutoff=Date.now()-settings.days*86400000,cap=settings.maxMB*1024*1024;
  let total=all.reduce((n,x)=>n+(x.size||0),0);const drop=[];
  for(const x of all){if(x.at<cutoff||total>cap){drop.push(x.id);total-=x.size||0}}
  if(!drop.length)return 0;
  const tx=d.transaction(STORE,"readwrite");const s=tx.objectStore(STORE);drop.forEach(id=>s.delete(id));await txDone(tx);
  changed();return drop.length;
}
