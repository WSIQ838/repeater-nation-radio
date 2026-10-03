// Desktop window helpers: the mini radio (small, always on top), the tray icon and
// system notifications. Outside the desktop app these quietly do nothing.
const inTauri=()=>typeof window!=="undefined"&&!!window.__TAURI_INTERNALS__;

export const MINI_SIZE={width:360,height:250};
const FULL_MIN={width:900,height:620},FULL_SIZE={width:1180,height:760};
let restore=null;

// Shrink the window to the mini radio and keep it above other windows, or put it back.
export async function setMiniWindow(on){
  if(!inTauri())return;
  try{
    const {getCurrentWindow,LogicalSize}=await import("@tauri-apps/api/window");
    const w=getCurrentWindow();
    if(on){
      const [size,scale,maximized]=await Promise.all([w.innerSize(),w.scaleFactor(),w.isMaximized()]);
      restore={width:Math.round(size.width/scale),height:Math.round(size.height/scale),maximized};
      if(maximized)await w.unmaximize();
      await w.setMinSize(new LogicalSize(MINI_SIZE.width,MINI_SIZE.height));
      await w.setSize(new LogicalSize(MINI_SIZE.width,MINI_SIZE.height));
      await w.setAlwaysOnTop(true);
    }else{
      await w.setAlwaysOnTop(false);
      await w.setMinSize(new LogicalSize(FULL_MIN.width,FULL_MIN.height));
      const r=restore||FULL_SIZE;
      await w.setSize(new LogicalSize(Math.max(r.width,FULL_MIN.width),Math.max(r.height,FULL_MIN.height)));
      restore=null;
    }
  }catch(err){console.warn("[mini] window change failed",err)}
}

// Tooltip on the tray icon, and whether the close button hides the radio to the tray.
// Resolves true when a tray icon exists (Linux needs AppIndicator for one).
export async function setTray(tooltip,closeToTray){
  if(!inTauri())return false;
  try{const {invoke}=await import("@tauri-apps/api/core");return await invoke("tray_set",{tooltip,closeToTray})}catch{return false}
}

// handler(action) for "mini" and "mute" picked from the tray menu. Returns an unlisten function.
export function listenTray(handler){
  if(!inTauri())return()=>{};
  let off=null,disposed=false;
  import("@tauri-apps/api/event").then(({listen})=>listen("tray-action",e=>handler(e.payload))).then(fn=>{if(disposed)fn();else off=fn}).catch(()=>{});
  return()=>{disposed=true;off?.()};
}

// System notification, only while the radio isn't the window in front.
let permission=null;
export const appInBackground=()=>document.hidden||!document.hasFocus();
export async function notify(title,body){
  try{
    if(inTauri()){
      const n=await import("@tauri-apps/plugin-notification");
      if(permission===null)permission=await n.isPermissionGranted()||(await n.requestPermission())==="granted";
      if(permission)n.sendNotification({title,body});
    }else if(typeof Notification!=="undefined"){
      if(Notification.permission==="default")await Notification.requestPermission();
      if(Notification.permission==="granted")new Notification(title,{body});
    }
  }catch{}
}
