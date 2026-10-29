import {accountIdentity,readAccount} from '../../../../lib/account-store.mjs';
import {firebaseConnection} from '../../../../lib/firebase-connection.mjs';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';

const notFound=()=>new Response('Not found',{status:404});
const imageResponse=(object: R2ObjectBody,mime:string,cache='no-store')=>new Response(object.body,{headers:{'Content-Type':mime,'Cache-Control':cache,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[a-f0-9-]{36}$/.test(id))return notFound();
 const connection=firebaseConnection(env);
 if(connection.enabled&&'config' in connection){
  const config=connection.config,row=await env.DB!.prepare('SELECT data FROM workspaces WHERE id=?').bind('firebase-market:'+config.projectId).first<{data:string}>(),market=row?JSON.parse(row.data):null,asset=market?.productAssets?.find((value:{id:string})=>value.id===id);
  if(!asset)return notFound();
  if(new URL(request.url).searchParams.get('preview')==='1'){
   let identity;try{identity=await accountIdentity(request,env);}catch{return new Response('Sign in required',{status:401});}
   if(identity.uid!==asset.ownerId&&!identity.admin)return notFound();const object=await env.BUCKET!.get(asset.key);return object?imageResponse(object,asset.mime):notFound();
  }
  if(asset.kind==='product'){
   const owner=await env.DB!.prepare('SELECT data FROM workspaces WHERE id=?').bind('firebase-account:'+config.projectId+':'+asset.ownerId).first<{data:string}>();
   if(!owner||JSON.parse(owner.data).status!=='Approved'||!market.providers.some((value:{id:string;publication?:{status:string}})=>value.id===asset.ownerId&&value.publication?.status==='Published')||!market.products.some((value:{ownerId:string;active:boolean;removed?:boolean;imageIds?:string[]})=>value.ownerId===asset.ownerId&&value.active&&!value.removed&&value.imageIds?.includes(id)))return notFound();
  }else if(asset.kind==='homecare-caregiver'){
   let identity;try{identity=await accountIdentity(request,env);}catch{return new Response('Sign in required',{status:401});}
   const provider=market.providers.find((value:{id:string;type:string;status:string;caregivers?:Array<{id:string;photoId?:string;accountId?:string}>})=>value.id===asset.ownerId&&value.type==='Homecare'&&value.status==='Approved'),caregiver=provider?.caregivers?.find((value:{id:string;photoId?:string;accountId?:string})=>value.id===asset.caregiverId&&value.photoId===id);
   if(!caregiver)return notFound();
   const ownerAccess=identity.uid===asset.ownerId||identity.admin;
   const {account}=await readAccount(env,identity.uid);
   const patientAccess=account?.role==='Patient'&&market.records.some((record:{type:string;patientId:string;providerId:string;assignedCaregiverId?:string;careStaffId?:string;companyBooking?:boolean;payment:string;status:string;assignmentStatus?:string})=>record.type==='Homecare'&&record.patientId===identity.uid&&record.payment==='Paid'&&!['Cancelled','Declined','Rejected'].includes(record.status)&&(record.providerId===asset.ownerId&&record.assignedCaregiverId===asset.caregiverId||record.companyBooking===true&&['Pending','Confirmed'].includes(record.assignmentStatus||'')&&!!caregiver.accountId&&record.careStaffId===caregiver.accountId));
   if(!ownerAccess&&!patientAccess)return notFound();
  }else return notFound();
  const object=await env.BUCKET!.get(asset.key);return object?imageResponse(object,asset.mime):notFound();
 }
 if(env.HRC_DEMO_ENABLED==='false')return notFound();
 const user=await getChatGPTUser();if(!user)return new Response('Authentication required',{status:401});
 const row=await env.DB!.prepare('SELECT data FROM workspaces WHERE id=?').bind(user.userId).first<{data:string}>();if(!row)return notFound();const state=JSON.parse(row.data),asset=state.productAssets?.find((value:{id:string})=>value.id===id);if(!asset)return notFound();
 if(asset.kind==='profile'&&!state.providers.some((value:{id:string;photoId?:string;status:string;publication?:{status:string}})=>value.id===asset.ownerId&&value.photoId===id&&value.status==='Approved'&&value.publication?.status==='Published'&&(!state.applications[value.id]||state.applications[value.id].status==='Approved')))return notFound();
 if(asset.kind==='homecare-caregiver'){
  const provider=state.providers?.find((value:{id:string;type:string;status:string;caregivers?:Array<{id:string;photoId?:string;accountId?:string}>})=>value.id===asset.ownerId&&value.type==='Homecare'&&value.status==='Approved'),caregiver=provider?.caregivers?.find((value:{id:string;photoId?:string;accountId?:string})=>value.id===asset.caregiverId&&value.photoId===id);
  if(!caregiver||state.session?.accountId!==asset.ownerId&&state.session?.role!=='Admin'&&!state.records?.some((record:{type:string;patientId:string;providerId:string;assignedCaregiverId?:string;careStaffId?:string;companyBooking?:boolean;assignmentStatus?:string;payment:string})=>record.type==='Homecare'&&record.patientId===state.session?.accountId&&record.payment==='Paid'&&(record.providerId===asset.ownerId&&record.assignedCaregiverId===asset.caregiverId||record.companyBooking===true&&['Pending','Confirmed'].includes(record.assignmentStatus||'')&&!!caregiver.accountId&&record.careStaffId===caregiver.accountId)))return notFound();
 }else if(asset.kind!=='product'&&asset.kind!=='profile')return notFound();
 const object=await env.BUCKET!.get(asset.key);return object?imageResponse(object,asset.mime,'private, max-age=300'):notFound();
}
