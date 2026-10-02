import {ControlHead} from "./ControlHead";

// Radios the user can pick from. They are being redone one at a time from Sean's
// photos; each draws the same radio through useFace/FaceDisplay (ControlHead.jsx),
// so a new radio needs only its layout and an entry in FACES.
export const FACES=[
  {id:"control-head",label:"Dispatch control head",note:"Full keypad, ten softkeys, P1–P5"},
];
export const DEFAULT_FACE="control-head";
const FACE_KEY="rn-face";
// A radio that has been removed from the list falls back to the default.
export const loadFace=()=>{try{const v=localStorage.getItem(FACE_KEY);return FACES.some(f=>f.id===v)?v:DEFAULT_FACE}catch{return DEFAULT_FACE}};
export const saveFace=v=>{try{localStorage.setItem(FACE_KEY,v)}catch{}};

export function RadioFace({face=DEFAULT_FACE,...p}){
  return <ControlHead {...p}/>;
}
