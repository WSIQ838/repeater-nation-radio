// Hardware PTT button (USB hand mic, foot switch, gamepad). The Tauri side listens even
// when the window isn't focused and only reports the button that was learned.
const inTauri=()=>typeof window!=="undefined"&&!!window.__TAURI_INTERNALS__;
const api=()=>Promise.all([import("@tauri-apps/api/core"),import("@tauri-apps/api/event")]);
const BINDING_KEY="rn-ptt-binding";

export function loadBinding(){try{return JSON.parse(localStorage.getItem(BINDING_KEY))||null}catch{return null}}
export function saveBinding(binding){try{binding?localStorage.setItem(BINDING_KEY,JSON.stringify(binding)):localStorage.removeItem(BINDING_KEY)}catch{}}

export async function pttCapabilities(){
  if(!inTauri())return {global_keys:false,gamepads:false};
  try{const [{invoke}]=await api();return await invoke("ptt_capabilities")}catch{return {global_keys:false,gamepads:false}}
}
export async function setHardwareBinding(binding){
  if(!inTauri())return;
  try{const [{invoke}]=await api();await invoke("ptt_set_binding",{binding:binding&&binding.kind!=="webkey"?binding:null})}catch{}
}
export async function setLearning(on){
  if(!inTauri())return;
  try{const [{invoke}]=await api();await invoke("ptt_learn",{on})}catch{}
}
// handlers: {onPtt(pressed), onLearned(binding), onLearnCancel()}. Returns an unlisten function.
export function listenHardware(handlers){
  if(!inTauri())return()=>{};
  let disposed=false;const offs=[];
  api().then(async([,{listen}])=>{
    for(const [name,fn] of [["ptt-hw",e=>handlers.onPtt?.(!!e.payload)],["ptt-learned",e=>handlers.onLearned?.(e.payload)],["ptt-learn-cancel",()=>handlers.onLearnCancel?.()]]){
      const off=await listen(name,fn);
      if(disposed)off();else offs.push(off);
    }
  }).catch(()=>{});
  return()=>{disposed=true;offs.forEach(off=>off())};
}

// Prefer a hand mic for audio when nothing has been chosen yet.
export const HAND_MIC=/hmic|kst|hand ?mic|speaker ?mic|ptt/i;
