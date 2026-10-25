import {firebaseConnection} from './firebase-connection.mjs';
export class AdminAccessError extends Error {}
const uid=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[\s\x00-\x1f]/.test(value);
export function freshAdmin(identity,now=Date.now()){return identity?.admin===true&&identity.emailVerified===true&&Number.isFinite(identity.authTime)&&now-identity.authTime*1000>=-1000&&now-identity.authTime*1000<=300000;}
export function requireFreshAdmin(identity){if(!freshAdmin(identity))throw new AdminAccessError('Confirm your sign-in again before changing administrator access.');}
export async function adminRegistry(env){
 if(!uid(env.HRC_MAIN_ADMIN_UID))return null;
 const connection=firebaseConnection(env);if(!connection.enabled)throw new AdminAccessError('Authentication must be configured before administrator setup.');
 const key='firebase-admin-access:'+connection.config.projectId;
 let row=await env.DB.prepare('SELECT data FROM workspaces WHERE id=?').bind(key).first();
 if(!row){const now=new Date().toISOString(),data={mainUid:env.HRC_MAIN_ADMIN_UID,members:{},pendingTransfer:null,audit:[{action:'bootstrap',actor:'Server configuration',target:env.HRC_MAIN_ADMIN_UID,at:now}]};await env.DB.prepare('INSERT OR IGNORE INTO workspaces (id,data,updated) VALUES (?,?,?)').bind(key,JSON.stringify(data),now).run();row=await env.DB.prepare('SELECT data FROM workspaces WHERE id=?').bind(key).first();}
 if(!row)throw new AdminAccessError('Administrator access is unavailable.');return {key,raw:row.data,data:JSON.parse(row.data)};
}
export const homebaseEmails=Object.freeze(['middlema12@gmail.com','support@healthreachcare.co.za']);
export async function resolveAdministrator(identity,env){if(env.HRC_HOMEBASE_ALLOWLIST==='true'){const admin=identity.emailVerified===true&&homebaseEmails.includes(String(identity.email||'').toLowerCase());return {...identity,admin,mainAdmin:false,homebaseRestricted:true};}const row=await adminRegistry(env);if(!row)return {...identity,mainAdmin:false};const mainAdmin=identity.emailVerified===true&&row.data.mainUid===identity.uid;return {...identity,admin:identity.emailVerified===true&&(mainAdmin||row.data.members[identity.uid]?.active===true),mainAdmin};}
export function changeAdminAccess(current,input,identity,targetAccount,now=new Date().toISOString()){
 requireFreshAdmin(identity);const next=structuredClone(current),main=current.mainUid===identity.uid;
 if(input.action==='acceptTransfer'){
  if(current.pendingTransfer?.target!==identity.uid||Date.parse(current.pendingTransfer.expiresAt)<=Date.parse(now))throw new AdminAccessError('No active ownership transfer is waiting for your account.');
  const previous=current.mainUid;next.mainUid=identity.uid;delete next.members[identity.uid];next.members[previous]={active:true,grantedBy:identity.uid,at:now};next.pendingTransfer=null;
 }else{
  if(!main)throw new AdminAccessError('Only the main administrator can manage administrators.');
  if(input.action==='cancelTransfer')next.pendingTransfer=null;
  else{
   if(!uid(input.targetUid)||!targetAccount||targetAccount.uid!==input.targetUid)throw new AdminAccessError('Choose an existing registered account by its Firebase UID.');
   if(input.targetUid===current.mainUid)throw new AdminAccessError('The main administrator cannot be removed or replaced through this action.');
   if(input.action==='grant')next.members[input.targetUid]={active:true,grantedBy:identity.uid,at:now};
   else if(input.action==='revoke'){next.members[input.targetUid]={active:false,revokedBy:identity.uid,at:now};if(next.pendingTransfer?.target===input.targetUid)next.pendingTransfer=null;}
   else if(input.action==='requestTransfer'){
    if(input.confirmUid!==identity.uid||current.members[input.targetUid]?.active!==true||!targetAccount.emailVerifiedAt)throw new AdminAccessError('Confirm your UID and choose an administrator who has verified their email and opened their account.');
    next.pendingTransfer={target:input.targetUid,requestedBy:identity.uid,at:now,expiresAt:new Date(Date.parse(now)+86400000).toISOString()};
   }else throw new AdminAccessError('Unsupported administrator action.');
  }
 }
 next.audit.push({action:input.action,actor:identity.uid,target:input.targetUid||identity.uid,at:now});return next;
}
