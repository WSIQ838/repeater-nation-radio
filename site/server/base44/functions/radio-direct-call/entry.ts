import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';
import { AccessToken, RoomServiceClient } from 'npm:livekit-server-sdk@2';
import { secrets } from 'base44:runtime';

const bad=['suspended','banned','investigation','deleted'];
const RINGING_TTL_MS=60000;
const ACTIVE_GRACE_MS=10000;
function voice() {
  const key=secrets.get('LIVEKIT_API_KEY'), secret=secrets.get('LIVEKIT_API_SECRET'), url=secrets.get('LIVEKIT_URL');
  if(!key||!secret||!url) throw new Error('Voice provider is not configured');
  return {key,secret,url};
}
function livekit() {
  const {key,secret,url}=voice();
  const httpUrl=url.replace(/^wss:\/\//,'https://').replace(/^ws:\/\//,'http://');
  return new RoomServiceClient(httpUrl,key,secret);
}
// 'list' is polled by every open radio widget. Open calls are rare (usually
// none at all), so one shared read of every open call answers all pollers on
// this instance for a few seconds, instead of two reads per member per poll.
// Any write made here drops the snapshot; other instances catch up within
// OPEN_TTL_MS.
const OPEN_TTL_MS=3000;
let openSnap=null;
let openLoading=null;
function openCalls(base44){
  if(openSnap&&Date.now()-openSnap.at<OPEN_TTL_MS) return Promise.resolve(openSnap.rows);
  if(!openLoading){
    openLoading=base44.asServiceRole.entities.RadioDirectCall.filter({status:{$in:['ringing','active']}},'-created_date',500)
      .then((rows)=>{ if(!Array.isArray(rows)) throw new Error('open call read failed'); openSnap={at:Date.now(),rows}; return rows; })
      .finally(()=>{ openLoading=null; });
  }
  return openLoading;
}
async function reconcileCalls(base44, userId, shared=null) {
  const [callerRows,recipientRows]=shared
    ? [shared.filter(r=>r.caller_user_id===userId),shared.filter(r=>r.recipient_user_id===userId)]
    : await Promise.all([
      // Only open calls matter here; ended/declined/missed history is never touched.
      base44.asServiceRole.entities.RadioDirectCall.filter({caller_user_id:userId,status:{$in:['ringing','active']}},'-created_date',50).catch(()=>[]),
      base44.asServiceRole.entities.RadioDirectCall.filter({recipient_user_id:userId,status:{$in:['ringing','active']}},'-created_date',50).catch(()=>[]),
    ]);
  // Work on copies so the shared snapshot is never mutated.
  const rows=[...(callerRows||[]),...(recipientRows||[])].map(r=>({...r}));
  // Returned so 'list' can answer from these same rows instead of querying again.
  const stillOpen=[];
  const seen=new Set();
  const now=Date.now();
  let svc=null; // only needed (and only required to be configured) for active calls
  for(const row of rows||[]) {
    if(seen.has(row.id)) continue;
    seen.add(row.id);
    if(row.status==='ringing') {
      const created=Date.parse(row.created_date||'');
      if(Number.isFinite(created) && now-created>RINGING_TTL_MS) {
        await base44.asServiceRole.entities.RadioDirectCall.update(row.id,{status:'missed'}).catch(()=>{});
        row.status='missed'; openSnap=null;
        await base44.asServiceRole.entities.UserNotification.create({
          user_id: row.caller_user_id,
          title: 'Missed Direct Radio Call',
          message: `${row.recipient_display_name || row.recipient_callsign || 'A member'} did not answer your direct radio call.`,
          type: 'message',
          sender_name: row.recipient_display_name || row.recipient_callsign || 'Direct Radio',
          link_url: '/members/' + row.recipient_user_id,
          link_label: 'View Member',
          description: `radio_call:${row.id}:missed`,
        }).catch(()=>{});
      }
      continue;
    }
    if(row.status!=='active' || !row.room_name) continue;
    try { svc=svc||livekit(); } catch { continue; }
    // Only the two members count: a dispatcher listening in must not keep a finished call open.
    const callMembers=new Set([row.caller_user_id,row.recipient_user_id]);
    const participants=((await svc.listParticipants(row.room_name).catch(()=>[]))||[]).filter(p=>callMembers.has(p.identity));
    if(!participants?.length) {
      const updated=Date.parse(row.updated_date||row.started_at||row.created_date||'');
      if(!Number.isFinite(updated) || now-updated>ACTIVE_GRACE_MS) {
        await base44.asServiceRole.entities.RadioDirectCall.update(row.id,{status:'ended'}).catch(()=>{});
        row.status='ended'; openSnap=null;
      }
    }
  }
  for(const row of rows) if(seen.has(row.id)&&['ringing','active'].includes(row.status)&&!stillOpen.some(x=>x.id===row.id)) stillOpen.push(row);
  return stillOpen;
}
// Service-role reads have been failing intermittently (2026-10-04); a failed
// read must not turn into "Member is unavailable" or "Call not found".
const RETRY_MS=[150,400,900];
async function readWithRetry(read){
  for(let attempt=0;;attempt++){
    const found=await read().catch(()=>null);
    if(found||attempt>=RETRY_MS.length) return found||null;
    await new Promise(r=>setTimeout(r,RETRY_MS[attempt]));
  }
}
async function me(base44){ const u=await base44.auth.me().catch(()=>null); if(!u) throw new Error('Authentication required'); if(bad.includes(u.account_status)) throw new Error('Your account cannot use voice right now'); return u; }
function clean(v){ return String(v||'').trim().toUpperCase(); }
// Dispatch access is limited to staff accounts, the same roles that may change radio channels and zones.
const DISPATCH_ROLES=['admin','super_admin','moderator'];
const isDispatcher=(u)=>DISPATCH_ROLES.includes(String(u?.role||''));
export default async function(req: Request) {
  const copy=req.clone();
  const res=await handle(req);
  // Writes may land after a concurrent poll refilled the snapshot; drop it
  // again once they're done so the change shows on the very next poll.
  const action=await copy.json().then(b=>String(b?.action||'')).catch(()=>'');
  if(action!=='list') openSnap=null;
  return res;
}
async function handle(req: Request) {
  try {
    const base44=createClientFromRequest(req); const caller=await me(base44);
    const body=await req.json().catch(()=>({})); const action=String(body.action||'');
    if(action!=='list') openSnap=null; // start/accept/decline/end change calls
    if(action==='start'){
      const recipientId=String(body.recipient_user_id||'').trim();
      if(!recipientId || recipientId===caller.id) return Response.json({error:'Invalid call recipient'},{status:400});
      // User.get can return null for real accounts (see adminGuard.ts), so look
      // the member up with filter by id like the rest of the app, then get.
      const target=await readWithRetry(async()=>(await base44.asServiceRole.entities.User.filter({id:recipientId},undefined,1).catch(()=>[]))?.[0]||await base44.asServiceRole.entities.User.get(recipientId));
      if(!target || bad.includes(target.account_status)) return Response.json({error:'Member is unavailable'},{status:404});
      const callsign=clean(caller.callsign), targetCallsign=clean(target.callsign);
      if(!callsign || caller.callsign_verified!==true) return Response.json({error:'A verified callsign is required to place direct calls'},{status:403});
      if(!targetCallsign || target.callsign_verified!==true) return Response.json({error:'That member does not have a verified callsign'},{status:400});
      const roomName='radio-direct-'+[caller.id,recipientId].sort().join('-');

      // Reconcile this caller's stale calls before checking for conflicts.
      // This prevents an orphaned active row from blocking a new direct call.
      await reconcileCalls(base44, caller.id).catch(()=>{});

      const [callerActive,recipientActive,callerRinging,recipientRinging]=await Promise.all([
        base44.asServiceRole.entities.RadioDirectCall.filter({caller_user_id:caller.id,status:'active'},'-created_date',20).catch(()=>[]),
        base44.asServiceRole.entities.RadioDirectCall.filter({recipient_user_id:caller.id,status:'active'},'-created_date',20).catch(()=>[]),
        base44.asServiceRole.entities.RadioDirectCall.filter({caller_user_id:caller.id,status:'ringing'},'-created_date',20).catch(()=>[]),
        base44.asServiceRole.entities.RadioDirectCall.filter({recipient_user_id:caller.id,status:'ringing'},'-created_date',20).catch(()=>[]),
      ]);
      const ownRows=[...(callerActive||[]),...(recipientActive||[]),...(callerRinging||[]),...(recipientRinging||[])];
      const freshRinging=ownRows.some(x=>{
        if(x.status!=='ringing') return false;
        const created=Date.parse(x.created_date||'');
        return !Number.isFinite(created)||Date.now()-created<=RINGING_TTL_MS;
      });
      const freshActive=ownRows.some(x=>x.status==='active');
      if(freshActive||freshRinging) return Response.json({error:'You are already in a direct call or have a pending call'},{status:409});

      const targetCaller=await base44.asServiceRole.entities.RadioDirectCall.filter({caller_user_id:recipientId,status:'active'},'-created_date',20).catch(()=>[]);
      const targetRecipient=await base44.asServiceRole.entities.RadioDirectCall.filter({recipient_user_id:recipientId,status:'active'},'-created_date',20).catch(()=>[]);
      const targetRingingCaller=await base44.asServiceRole.entities.RadioDirectCall.filter({caller_user_id:recipientId,status:'ringing'},'-created_date',20).catch(()=>[]);
      const targetRingingRecipient=await base44.asServiceRole.entities.RadioDirectCall.filter({recipient_user_id:recipientId,status:'ringing'},'-created_date',20).catch(()=>[]);
      const targetRows=[...(targetCaller||[]),...(targetRecipient||[]),...(targetRingingCaller||[]),...(targetRingingRecipient||[])];
      const targetFreshRinging=targetRows.some(x=>{
        if(x.status!=='ringing') return false;
        const created=Date.parse(x.created_date||'');
        return !Number.isFinite(created)||Date.now()-created<=RINGING_TTL_MS;
      });
      if(targetRows.some(x=>x.status==='active')||targetFreshRinging) return Response.json({error:'One of the members is already in a direct call or has a pending call'},{status:409});

      const row=await base44.asServiceRole.entities.RadioDirectCall.create({caller_user_id:caller.id,caller_callsign:callsign,caller_display_name:caller.full_name||caller.email||'Member',recipient_user_id:recipientId,recipient_callsign:targetCallsign,recipient_display_name:target.full_name||target.email||'Member',status:'ringing',room_name:roomName});
      await base44.asServiceRole.entities.UserNotification.create({
        user_id: recipientId,
        title: 'Incoming Direct Radio Call',
        message: `${caller.full_name || callsign || 'A member'} is calling you directly.`,
        type: 'message',
        sender_name: caller.full_name || callsign || 'Direct Radio',
        link_url: '/members/' + caller.id,
        link_label: 'View Caller',
        description: `radio_call:${row.id}:incoming`,
      }).catch(()=>{});
      return Response.json({ok:true,call:row});
    }
    if(action==='list' && body.all===true) {
      // Dispatch console: every open call, not just the caller's own.
      if(!isDispatcher(caller)) return Response.json({error:'Control access required'},{status:403});
      const shared=await openCalls(base44).catch(()=>null);
      if(!shared) return Response.json({error:'Could not read direct calls'},{status:503});
      const byId=new Map();
      for(const callerId of [...new Set(shared.map(r=>r.caller_user_id))].slice(0,50)) {
        for(const row of await reconcileCalls(base44, callerId, shared).catch(()=>[])) byId.set(row.id,row);
      }
      return Response.json({ok:true,calls:[...byId.values()]});
    }
    if(action==='list') {
      // Polled by every open radio widget: answer from the shared snapshot of
      // open calls, falling back to this member's own reads if it fails.
      const shared=await openCalls(base44).catch(()=>null);
      const mine=await reconcileCalls(base44, caller.id, shared).catch(()=>[]);
      return Response.json({ok:true,calls:mine||[]});
    }
    const callId=String(body.call_id||'').trim();
    if(!callId) return Response.json({error:'call_id required'},{status:400});
    const call=await readWithRetry(()=>base44.asServiceRole.entities.RadioDirectCall.get(callId));
    if(!call) return Response.json({error:'Call not found'},{status:404});
    const isCaller=call.caller_user_id===caller.id, isRecipient=call.recipient_user_id===caller.id;
    if(action==='token' && !isCaller && !isRecipient && (body.mode==='listen'||body.mode==='talk')) {
      // Dispatch joins any active call: silently ('listen') or with a microphone ('talk').
      if(!isDispatcher(caller)) return Response.json({error:'Control access required'},{status:403});
      if(call.status!=='active') return Response.json({error:'Call is not active'},{status:409});
      const roomName='radio-direct-'+[call.caller_user_id,call.recipient_user_id].sort().join('-');
      const {key,secret,url}=voice();
      const displayName=caller.full_name||caller.email||'Dispatch';
      const at=new AccessToken(key,secret,{identity:`rn-dispatch-${caller.id}-${crypto.randomUUID()}`,name:displayName,ttl:'10m',metadata:JSON.stringify({callsign:'DISPATCH',displayName,directCallId:call.id,sessionType:'dispatch',userId:caller.id})});
      at.addGrant({room:roomName,roomJoin:true,canPublish:body.mode==='talk',canPublishData:false,canSubscribe:true});
      // Listening in on a private call is recorded.
      await base44.asServiceRole.entities.AuditLog.create({admin_id:caller.id,admin_name:displayName,action:`radio.direct_call.dispatch_${body.mode}`,category:'security',target_type:'RadioDirectCall',target_id:call.id,target_label:`${call.caller_callsign||'?'} <-> ${call.recipient_callsign||'?'}`}).catch(()=>{});
      return Response.json({ok:true,liveKitToken:await at.toJwt(),liveKitUrl:url,roomName,call});
    }
    if(!isCaller&&!isRecipient) return Response.json({error:'Not a participant in this call'},{status:403});
    if(action==='decline'){
      if(!isRecipient || call.status!=='ringing') return Response.json({error:'Call cannot be declined'},{status:409});
      const updated=await base44.asServiceRole.entities.RadioDirectCall.update(call.id,{status:'declined'});
      await base44.asServiceRole.entities.UserNotification.create({
        user_id: call.caller_user_id,
        title: 'Direct Radio Call Declined',
        message: `${call.recipient_display_name || call.recipient_callsign || 'The member'} declined your direct radio call.`,
        type: 'message',
        sender_name: call.recipient_display_name || call.recipient_callsign || 'Direct Radio',
        link_url: '/members/' + call.recipient_user_id,
        link_label: 'View Member',
        description: `radio_call:${call.id}:declined`,
      }).catch(()=>{});
      return Response.json({ok:true,call:updated});
    }
    if(action==='end'){
      const updated=await base44.asServiceRole.entities.RadioDirectCall.update(call.id,{status:'ended'});
      return Response.json({ok:true,call:updated});
    }
    if(action==='accept'){
      if(!isRecipient || call.status!=='ringing') return Response.json({error:'Call cannot be accepted'},{status:409});
      const svc=livekit();
      const roomName='radio-direct-'+[call.caller_user_id,call.recipient_user_id].sort().join('-');
      const participants=await svc.listParticipants(roomName).catch(()=>[]);
      const allowed=new Set([call.caller_user_id,call.recipient_user_id]);
      const activeAllowed=(participants||[]).filter(p=>allowed.has(p.identity));
      if(activeAllowed.length>=2) return Response.json({error:'Call is already connected'},{status:409});
      const updated=await base44.asServiceRole.entities.RadioDirectCall.update(call.id,{status:'active',started_at:new Date().toISOString(),room_name:roomName});
      return Response.json({ok:true,call:updated});
    }
    if(action==='token'){
      if(call.status!=='active' && !(isCaller&&call.status==='ringing')) return Response.json({error:'Call is not active'},{status:409});
      const expectedRoom='radio-direct-'+[call.caller_user_id,call.recipient_user_id].sort().join('-');
      if(call.room_name!==expectedRoom) await base44.asServiceRole.entities.RadioDirectCall.update(call.id,{room_name:expectedRoom}).catch(()=>{});
      const roomName=expectedRoom;
      const {key,secret,url}=voice();
      const callsign=isCaller?call.caller_callsign:call.recipient_callsign;
      const displayName=isCaller?call.caller_display_name:call.recipient_display_name;
      const at=new AccessToken(key,secret,{identity:caller.id,name:displayName,ttl:'10m',metadata:JSON.stringify({callsign,displayName,directCallId:call.id})});
      at.addGrant({room:roomName,roomJoin:true,canPublish:true,canPublishData:false,canSubscribe:true});
      return Response.json({ok:true,liveKitToken:await at.toJwt(),liveKitUrl:url,roomName,call:{...call,room_name:roomName}});
    }
    return Response.json({error:'Unknown action'},{status:400});
  } catch(e) {
    const msg=e?.message||'Direct call failed';
    const status=msg==='Authentication required'?401:500;
    return Response.json({error:msg},{status});
  }
}