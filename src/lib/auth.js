import { createClient } from "@base44/sdk";
import { config } from "./config";

const TOKEN_KEY = "rn_radio_access_token";
let accessToken = null;

function readAccessToken() {
  if (accessToken) return accessToken;
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("access_token");
  if (fromUrl) {
    accessToken = fromUrl;
    localStorage.setItem(TOKEN_KEY, fromUrl);
    params.delete("access_token");
    window.history.replaceState({}, document.title, window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash);
    return accessToken;
  }
  accessToken = localStorage.getItem(TOKEN_KEY) || "";
  return accessToken || null;
}

function client() {
  return createClient({appId:config.base44AppId,token:readAccessToken()||undefined,functionsVersion:config.base44FunctionsVersion||undefined,serverUrl:"",requiresAuth:false,appBaseUrl:config.base44AppBaseUrl||undefined});
}

export async function restoreSession() {
  try {
    const member=await client().auth.me();
    return member?{token:readAccessToken()||"",member}:null;
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    accessToken=null;
    return null;
  }
}

export async function loginWithPassword(email,password){
  const normalizedEmail=email.trim();
  if(!normalizedEmail||!password) throw new Error("Enter your Repeater Nation email and password.");
  const authClient=client();
  await authClient.auth.loginViaEmailPassword(normalizedEmail,password);
  const member=await authClient.auth.me();
  if(!member) throw new Error("Sign in succeeded, but the account session could not be loaded.");
  return {token:readAccessToken()||"",member};
}

async function invoke(name,payload){const result=await client().functions.invoke(name,payload);return result?.data||result;}

export const issueRadioSession=channelId=>invoke("issue-radio-session",{channel_id:channelId,session_type:"radio"});
export const issueRadioPTT=(channelId,action)=>invoke("radio-ptt",{action,channel_id:channelId});
export const radioPresence=()=>invoke("radio-presence",{});
export const directCall=(action,payload={})=>invoke("radio-direct-call",{action,...payload});

export async function listRadioChannels(){
  const base44=client();
  const channels=await base44.entities.RadioChannel.filter({enabled:true},"number",100);
  const zones=await base44.entities.RadioZone.filter({enabled:true},"display_order",20);
  const zoneMap=new Map((zones||[]).map(z=>[z.id,z.name]));
  return (channels||[]).map(c=>({id:c.id,name:c.name,number:c.number,zoneId:c.zone_id,zoneName:zoneMap.get(c.zone_id)||"Radio",label:(zoneMap.get(c.zone_id)||"Radio")+" · "+c.name}));
}

export function clearSession(){localStorage.removeItem(TOKEN_KEY);accessToken=null;}