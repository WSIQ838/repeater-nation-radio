import {useLayoutEffect,useRef} from "react";

// A channel line for a radio screen: "Ch 2" in front of the channel name. When the line is
// too wide for the screen the text shrinks a little first, then the name is cut short
// with "…", so "Ch 2" always stays readable.
export function ChanLine({number,name}){
  const ref=useRef(null),n=String(name||"").trim();
  useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    // Measure the text itself (not rounded like scrollWidth) against the line's width.
    const range=document.createRange();
    const over=()=>{range.selectNodeContents(el);const box=el.getBoundingClientRect().width;return box>0&&range.getBoundingClientRect().width>box-0.5};
    const fit=()=>{
      el.style.fontSize="";
      for(let s=1;s>0.7&&over();s-=0.05)el.style.fontSize=(s-0.05).toFixed(2)+"em";
    };
    fit();
    // Fit again once the screen's font has loaded or the screen changes size.
    let live=true;document.fonts?.ready?.then(()=>{if(live)fit()});
    const ro=typeof ResizeObserver!=="undefined"&&el.parentElement?new ResizeObserver(fit):null;ro?.observe(el.parentElement);
    return()=>{live=false;ro?.disconnect()};
  },[number,n]);
  return <span ref={ref} className="lbl chan-line">{number!=null&&number!==""&&<span className="chn">Ch {number}</span>}{number!=null&&number!==""&&n?" ":""}{n}</span>;
}
