// Hardware PTT button (USB hand mic, foot switch, gamepad). The Tauri side listens even
// when the window isn't focused and only reports the button that was learned.
const inTauri=()=>typeof window!=="undefined"&&!!window.__TAURI_INTERNALS__;
const api=()=>Promise.all([import("@tauri-apps/api/core"),import("@tauri-apps/api/event")]);
export async function hwCapabilities(){
  if(!inTauri())return {global_keys:false,gamepads:false};
  try{const [{invoke}]=await api();return await invoke("hw_capabilities")}catch{return {global_keys:false,gamepads:false}}
}
// In-window keys ("webkey") are handled by the page; everything else goes to the native side.
export async function setHardwareBindings(bindings){
  if(!inTauri())return;
  try{const [{invoke}]=await api();await invoke("hw_set_bindings",{bindings:bindings.filter(b=>b.kind!=="webkey")})}catch{}
}
export async function setLearning(on){
  if(!inTauri())return;
  try{const [{invoke}]=await api();await invoke("hw_learn",{on})}catch{}
}
// handlers: {onAction({action,pressed,global}), onLearned({kind,code,label}), onLearnCancel()}. Returns an unlisten function.
export function listenHardware(handlers){
  if(!inTauri())return()=>{};
  let disposed=false;const offs=[];
  api().then(async([,{listen}])=>{
    for(const [name,fn] of [["hw-action",e=>handlers.onAction?.(e.payload)],["hw-learned",e=>handlers.onLearned?.(e.payload)],["hw-learn-cancel",()=>handlers.onLearnCancel?.()]]){
      const off=await listen(name,fn);
      if(disposed)off();else offs.push(off);
    }
  }).catch(()=>{});
  return()=>{disposed=true;offs.forEach(off=>off())};
}

// Prefer a hand mic for audio when nothing has been chosen yet.
export const HAND_MIC=/hmic|kst|hand ?mic|speaker ?mic|ptt|hands-?free/i;

// Bluetooth LE PTT buttons that report on their own service rather than as a key.
const BLE_KEY="rn-ble-device";
export function loadBleDevice(){try{return JSON.parse(localStorage.getItem(BLE_KEY))||null}catch{return null}}
export function saveBleDevice(d){try{d?localStorage.setItem(BLE_KEY,JSON.stringify(d)):localStorage.removeItem(BLE_KEY)}catch{}}
export async function bleScan(){const [{invoke}]=await api();return invoke("ble_scan")}
export async function bleConnect(device){if(!inTauri()||!device)return;try{const [{invoke}]=await api();await invoke("ble_connect",{id:device.id,name:device.name})}catch{}}
export async function bleDisconnect(){if(!inTauri())return;try{const [{invoke}]=await api();await invoke("ble_disconnect")}catch{}}
export function listenBle(onStatus){
  if(!inTauri())return()=>{};
  let off=null,disposed=false;
  api().then(async([,{listen}])=>{const o=await listen("ble-status",e=>onStatus(e.payload));if(disposed)o();else off=o}).catch(()=>{});
  return()=>{disposed=true;off?.()};
}
export const inDesktopApp=inTauri;
