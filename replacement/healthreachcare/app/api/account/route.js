import {requireFreshAdmin,AdminAccessError} from '../../../lib/admin-access.mjs';
import {env} from 'cloudflare:workers';
import {accountIdentity,readAccount,saveAccount,accountPrefix} from '../../../lib/account-store.mjs';
import {AccountValidationError,changeAccount,accountReady} from '../../../lib/real-account.mjs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(req){let identity;try{identity=await accountIdentity(req,env);}catch{return Response.json({error:'Sign in again to continue.'},{status:401,headers});}try{
 const own=await readAccount(env,identity.uid);let account=own.account;if(account&&identity.emailVerified&&!account.emailVerifiedAt){account={...account,emailVerifiedAt:new Date().toISOString()};await saveAccount(env,own,account);}let applications=[];
 if(identity.admin){const rows=await env.DB.prepare('SELECT data FROM workspaces WHERE id LIKE ?').bind(accountPrefix(env)+'%').all();applications=(rows.results||[]).map(r=>JSON.parse(r.data)).filter(a=>a.role!=='Patient');}
 return Response.json({identity,account,ready:accountReady(account,identity),applications},{headers});
 }catch{return Response.json({error:'Account data is unavailable. Please retry.'},{status:503,headers});}}
export async function POST(req){let identity;try{identity=await accountIdentity(req,env);}catch{return Response.json({error:'Sign in again to continue.'},{status:401,headers});}
 if(Number(req.headers.get('content-length')||0)>18000)return Response.json({error:'Request too large.'},{status:413,headers});
 let input;try{const body=await req.text();if(body.length>18000)throw Error();input=JSON.parse(body);if(!input||Array.isArray(input)||typeof input!=='object'||typeof input.action!=='string')throw Error();}catch{return Response.json({error:'Invalid account request.'},{status:400,headers});}
 if(!identity.emailVerified&&input.action!=='register')return Response.json({error:'Confirm your email before continuing.'},{status:403,headers});
 if(input.action==='document')return Response.json({error:'Use the secure document upload.'},{status:400,headers});
 if(input.action==='review'&&!identity.admin)return Response.json({error:'Administrator permission required.'},{status:403,headers});
 if(input.action!=='review'&&input.uid&&input.uid!==identity.uid)return Response.json({error:'You can only change your own account.'},{status:403,headers});
 try{if(input.action==='review')requireFreshAdmin(identity);const row=await readAccount(env,input.action==='review'?input.uid:identity.uid);const account=changeAccount(row.account,input,identity);await saveAccount(env,row,account);return Response.json({account,ready:accountReady(account,identity)},{headers});}catch(e){return Response.json({error:(e instanceof AccountValidationError||e instanceof AdminAccessError)?e.message:'Unable to save account. Please retry.'},{status:400,headers});}}
