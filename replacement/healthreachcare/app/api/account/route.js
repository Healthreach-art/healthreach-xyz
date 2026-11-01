import {requireFreshAdmin,AdminAccessError} from '../../../lib/admin-access.mjs';
import {env} from 'cloudflare:workers';
import {accountIdentity,readAccount,saveAccount,accountPrefix} from '../../../lib/account-store.mjs';
import {AccountValidationError,changeAccount,accountReady} from '../../../lib/real-account.mjs';
import {eraseAccountWorkspace} from '../../../lib/account-erasure.mjs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(req){let identity;try{identity=await accountIdentity(req,env);}catch{return Response.json({error:'Sign in again to continue.'},{status:401,headers});}try{
 const own=await readAccount(env,identity.uid);let account=own.account;if(account&&identity.admin&&(account.role!=='Admin'||account.email!==identity.email)){const at=new Date().toISOString();account={...account,role:'Admin',email:identity.email,updatedAt:at,audit:[...(account.audit||[]),{action:'trusted-administrator-role',actor:identity.uid,at}]};await saveAccount(env,own,account);own.raw=JSON.stringify(account);}else if(account&&identity.emailVerified&&account.email!==identity.email){account={...account,email:identity.email,updatedAt:new Date().toISOString()};await saveAccount(env,own,account);own.raw=JSON.stringify(account);}if(account&&identity.emailVerified&&!account.emailVerifiedAt){account={...account,emailVerifiedAt:new Date().toISOString()};await saveAccount(env,own,account);}let applications=[];
 if(identity.admin){const rows=await env.DB.prepare('SELECT data FROM workspaces WHERE id LIKE ?').bind(accountPrefix(env)+'%').all();applications=(rows.results||[]).map(r=>JSON.parse(r.data)).filter(a=>['Pharmacy','Doctor','Homecare','Driver','Patient'].includes(a.role));const project=JSON.parse(env.FIREBASE_WEB_CONFIG||'{}').projectId,market=project?await env.DB.prepare('SELECT data FROM workspaces WHERE id=?').bind('firebase-market:'+project).first():null,workspace=market?.data?JSON.parse(market.data):null;for(const account of applications){account.publicProfile=account.role==='Pharmacy'?((workspace?.providers||[]).find(v=>v.id===account.uid)||account.application?.publicProfile||null):account.role==='Driver'?((workspace?.drivers||{})[account.uid]?.publicProfile||account.application?.publicProfile||null):account.application?.publicProfile||((workspace?.providers||[]).find(v=>v.id===account.uid)||null);}}
 return Response.json({identity,account,ready:accountReady(account,identity),applications},{headers});
 }catch{return Response.json({error:'Account data is unavailable. Please retry.'},{status:503,headers});}}
export async function POST(req){let identity;try{identity=await accountIdentity(req,env);}catch{return Response.json({error:'Sign in again to continue.'},{status:401,headers});}
 if(Number(req.headers.get('content-length')||0)>18000)return Response.json({error:'Request too large.'},{status:413,headers});
 let input;try{const body=await req.text();if(body.length>18000)throw Error();input=JSON.parse(body);if(!input||Array.isArray(input)||typeof input!=='object'||typeof input.action!=='string')throw Error();}catch{return Response.json({error:'Invalid account request.'},{status:400,headers});}
 if(!identity.emailVerified&&input.action!=='register')return Response.json({error:'Confirm your email before continuing.'},{status:403,headers});
 if(input.action==='document')return Response.json({error:'Use the secure document upload.'},{status:400,headers});
 if(['review','homecareStaff'].includes(input.action)&&!identity.admin)return Response.json({error:'Administrator permission required.'},{status:403,headers});
 if(!['review','homecareStaff'].includes(input.action)&&input.uid&&input.uid!==identity.uid)return Response.json({error:'You can only change your own account.'},{status:403,headers});
 try{if(['review','homecareStaff'].includes(input.action))requireFreshAdmin(identity);const row=await readAccount(env,['review','homecareStaff'].includes(input.action)?input.uid:identity.uid);if(input.action==='review'&&input.decision==='Approved'){
   const account=row.account,project=JSON.parse(env.FIREBASE_WEB_CONFIG||'{}').projectId,workspaceRow=project?await env.DB.prepare('SELECT data FROM workspaces WHERE id=?').bind('firebase-market:'+project).first():null,workspace=workspaceRow?.data?JSON.parse(workspaceRow.data):null,profile=workspace?.providers?.find(value=>value.id===input.uid),driverProfile=workspace?.drivers?.[input.uid]?.publicProfile,publicProfile=account?.role==='Pharmacy'?(profile||account?.application?.publicProfile):account?.role==='Driver'?(driverProfile||account?.application?.publicProfile):account?.application?.publicProfile;
   let ready=false;
   if(account?.role==='Pharmacy'){const point=publicProfile?.coordinates;ready=!!(publicProfile?.name&&publicProfile.description&&publicProfile.location&&(publicProfile.serviceArea||publicProfile.serviceAreas?.length)&&point&&Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)&&point.latitude>=-34.45&&point.latitude<=-33.45&&point.longitude>=18.15&&point.longitude<=19.15);}
   else if(account?.role==='Driver')ready=!!(publicProfile?.name&&publicProfile.description&&publicProfile.serviceArea&&publicProfile.vehicle&&publicProfile.phone);
   else if(account?.role==='Doctor')ready=!!(profile?.name&&profile.description&&profile.location&&(profile.servicePrices||[]).some(value=>value.active!==false&&Number(value.price)>0)&&profile.modes?.length);
   else if(account?.role==='Homecare')ready=true;
   if(!ready)throw new AccountValidationError('Complete the required Public profile before approval. Pharmacy profiles need a Cape Town address pin; doctors need a service, price and consultation type; drivers need a short profile and vehicle type.');
   input.reviewed=true;
 }
 const account=changeAccount(row.account,input,identity);await saveAccount(env,row,account);if(['deleteSelf','review'].includes(input.action)&&account.status==='Deleted'){
   await eraseAccountWorkspace(env,row.account);
   for(const document of row.account?.documents||[])if(document.key)await env.BUCKET?.delete(document.key);
 }
 return Response.json({account,ready:accountReady(account,identity)},{headers});}catch(e){return Response.json({error:(e instanceof AccountValidationError||e instanceof AdminAccessError)?e.message:'Unable to save account. Please retry.'},{status:400,headers});}}
