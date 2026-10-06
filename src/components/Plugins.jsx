import {useRef,useState} from "react";
import {PERMISSIONS,installPlugin,parsePlugin,pluginInstalled,pressPanelButton,removePlugin,setPluginEnabled,usePlugins} from "../lib/plugins";
import {EXAMPLE_PLUGINS} from "../plugins/examples";

// Settings › Plugins: install from a file, see what each plugin may do, turn it off or remove it.
export function PluginSettings(){
  const {installed,errors}=usePlugins();
  const fileRef=useRef(null);
  const [pending,setPending]=useState(null),[note,setNote]=useState("");
  // Nothing is installed until the person has read what the plugin may do and pressed Install.
  const review=code=>{
    setNote("");
    try{const meta=parsePlugin(code);setPending({meta,code,replaces:pluginInstalled(meta.id)})}
    catch(err){setPending(null);setNote(err.message)}
  };
  const pick=async e=>{const f=e.target.files?.[0];e.target.value="";if(f)review(await f.text())};
  const confirm=()=>{try{const p=installPlugin(pending.code);setNote(`${p.name} is installed and on.`)}catch(err){setNote(err.message)}setPending(null)};
  return <div className="plugins">
    <p className="muted">Plugins are add-ons other people make for the radio. Only install plugins from people you trust. A plugin can only do the things listed under it, and it can never see your sign-in, use your microphone or key up the radio.</p>
    <div className="plugin-add">
      <button type="button" className="primary" onClick={()=>fileRef.current?.click()}>Install plugin from file…</button>
      <input ref={fileRef} type="file" accept=".js,.txt,text/javascript" hidden onChange={pick}/>
      <select aria-label="Try an example plugin" value="" onChange={e=>{const x=EXAMPLE_PLUGINS.find(p=>p.id===e.target.value);if(x)review(x.code)}}>
        <option value="">Try an example…</option>
        {EXAMPLE_PLUGINS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
    {pending&&<div className="plugin-review">
      <strong>{pending.replaces?"Update":"Install"} “{pending.meta.name}”{pending.meta.version?" "+pending.meta.version:""}?</strong>
      {pending.meta.author&&<small>By {pending.meta.author}</small>}
      {pending.meta.description&&<p>{pending.meta.description}</p>}
      <PermissionList perms={pending.meta.permissions} intro="This plugin will be able to:"/>
      <div className="plugin-actions"><button type="button" className="primary" onClick={confirm}>{pending.replaces?"Update":"Install"}</button><button type="button" onClick={()=>setPending(null)}>Cancel</button></div>
    </div>}
    {note&&<div className="plugin-note">{note}</div>}
    {installed.length?<ul className="plugin-list">{installed.map(p=><li key={p.id} className={p.enabled?"on":"off"}>
      <div className="plugin-head">
        <div><strong>{p.name}</strong>{p.version&&<small> {p.version}</small>}{p.author&&<small> · by {p.author}</small>}</div>
        <div className="plugin-actions">
          <label className="plugin-toggle"><input type="checkbox" checked={p.enabled} onChange={e=>setPluginEnabled(p.id,e.target.checked)}/> {p.enabled?"On":"Off"}</label>
          <button type="button" className="danger" onClick={()=>{if(window.confirm(`Remove ${p.name}?`))removePlugin(p.id)}}>Remove</button>
        </div>
      </div>
      {p.description&&<p className="muted">{p.description}</p>}
      <PermissionList perms={p.permissions} intro="Can:"/>
      {p.enabled&&errors[p.id]&&<div className="error">Plugin problem: {errors[p.id]}</div>}
    </li>)}</ul>:<div className="empty">No plugins installed.</div>}
  </div>;
}

function PermissionList({perms,intro}){
  if(!perms.length)return <small className="muted">It doesn't ask for anything: it can only keep its own notes.</small>;
  return <div className="plugin-perms"><small>{intro}</small><ul>{perms.map(x=><li key={x}>{PERMISSIONS[x]}</li>)}</ul></div>;
}

// Panels plugins add under the radio, drawn by the app from what the plugin sends.
export function PluginPanels(){
  const {panels,installed}=usePlugins();
  const ids=Object.keys(panels).filter(id=>installed.some(p=>p.id===id&&p.enabled));
  if(!ids.length)return null;
  return <div className="grid plugin-panels">{ids.map(id=>{const v=panels[id],p=installed.find(x=>x.id===id);return <section key={id} className="panel plugin-panel">
    <div className="panel-title">{v.title||p.name}</div>
    {v.lines.map((l,i)=><div key={i} className="plugin-line">{l}</div>)}
    {v.buttons.length>0&&<div className="plugin-buttons">{v.buttons.map(b=><button type="button" key={b.id} onClick={()=>pressPanelButton(id,b.id)}>{b.label}</button>)}</div>}
  </section>})}</div>;
}
