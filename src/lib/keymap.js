// Every radio action a button can be mapped to, and the saved button map.
export const ACTIONS=[
  {id:"ptt",label:"Push to talk (hold)",group:"Transmit"},
  {id:"channel_up",label:"Channel up",group:"Channel & zone"},
  {id:"channel_down",label:"Channel down",group:"Channel & zone"},
  {id:"zone_up",label:"Zone up",group:"Channel & zone"},
  {id:"zone_down",label:"Zone down",group:"Channel & zone"},
  ...[1,2,3,4,5].map(n=>({id:"p"+n,label:"P"+n+" one-touch channel",group:"Channel & zone"})),
  {id:"power",label:"Power (connect / disconnect)",group:"Radio"},
  {id:"mute",label:"Mute / unmute speaker",group:"Radio"},
  {id:"volume_up",label:"Volume up",group:"Radio"},
  {id:"volume_down",label:"Volume down",group:"Radio"},
  {id:"recent",label:"Recent (last heard)",group:"Radio"},
  {id:"replay",label:"Replay last transmission",group:"Radio"},
  {id:"scan",label:"Scan on / off",group:"Channel & zone"},
  {id:"nuisance",label:"Nuisance delete (skip scanned channel)",group:"Channel & zone"},
  {id:"home",label:"Home",group:"Radio"},
  {id:"who",label:"Who's On",group:"Radio"},
  {id:"bright_up",label:"Display brighter",group:"Radio"},
  {id:"bright_down",label:"Display dimmer",group:"Radio"},
  {id:"answer",label:"Answer call",group:"Calls"},
  {id:"decline",label:"Decline call",group:"Calls"},
  {id:"end_call",label:"End call",group:"Calls"},
  ...[1,2,3,4,5].map(n=>({id:"soft_t"+n,label:"Top softkey "+n,group:"Softkeys"})),
  ...[1,2,3,4,5].map(n=>({id:"soft_b"+n,label:"Bottom softkey "+n,group:"Softkeys"})),
  ...["1","2","3","4","5","6","7","8","9","0","*","#"].map(k=>({id:"key_"+k,label:"Keypad "+k,group:"Keypad"})),
];
export const actionLabel=id=>ACTIONS.find(a=>a.id===id)?.label||id;

// Space and Num 0 key PTT while the app is focused. With the Windows hook they are
// native keys (virtual-key codes); elsewhere the page reads them as in-window keys.
export function defaultBindings(globalKeys){
  return globalKeys
    ?[{action:"ptt",kind:"key",code:"32",label:"Space",global:false},{action:"ptt",kind:"key",code:"96",label:"Num 0",global:false}]
    :[{action:"ptt",kind:"webkey",code:"Space",label:"Space",global:false},{action:"ptt",kind:"webkey",code:"Numpad0",label:"Num 0",global:false}];
}

// Typing keys default to "only while the app is focused"; everything a hand mic,
// Bluetooth button, mouse or gamepad sends defaults to working in the background.
export function defaultGlobal(input){
  if(input.kind==="webkey")return false;
  if(input.kind!=="key")return true;
  const vk=Number(input.code);
  return (vk>=0x7C&&vk<=0x87)||(vk>=0xA6&&vk<=0xB7);
}

const KEY="rn-keymap",OLD_PTT_KEY="rn-ptt-binding";
export function loadKeymap(globalKeys){
  try{const saved=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(saved))return saved}catch{}
  const map=defaultBindings(globalKeys);
  // Carry over the single PTT button learned in 0.1.15/0.1.16.
  try{const old=JSON.parse(localStorage.getItem(OLD_PTT_KEY));if(old?.kind)map.push({action:"ptt",kind:old.kind,code:old.code,label:old.label||"",global:defaultGlobal(old)})}catch{}
  return map;
}
export function saveKeymap(map){try{localStorage.setItem(KEY,JSON.stringify(map));localStorage.removeItem(OLD_PTT_KEY)}catch{}}
export const sameInput=(a,b)=>a.kind===b.kind&&a.code===b.code;
