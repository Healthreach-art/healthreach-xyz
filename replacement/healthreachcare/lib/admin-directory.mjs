import {accountIdentity,accountPrefix} from './account-store.mjs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const roles=['Patient','Pharmacy','Doctor','Homecare','Driver'];
export async function adminDirectory(req,env,identify=accountIdentity){
 let identity;try{identity=await identify(req,env);}catch{return Response.json({error:'Sign in again.'},{status:401,headers});}
 if(!identity.admin||!identity.emailVerified)return Response.json({error:'Administrator permission required.'},{status:403,headers});
 const url=new URL(req.url),role=url.searchParams.get('role')||'',search=(url.searchParams.get('search')||'').trim(),page=Number(url.searchParams.get('page')||0),limit=25;
 if(role&&!roles.includes(role)||search.length>120||!Number.isSafeInteger(page)||page<0||page>10000)return Response.json({error:'Choose valid directory filters.'},{status:400,headers});
 const clauses=['id LIKE ?'],args=[accountPrefix(env)+'%'];
 if(role){clauses.push("json_extract(data,'$.role')=?");args.push(role);}
 if(search){clauses.push("(instr(lower(json_extract(data,'$.fullName')),lower(?))>0 OR instr(lower(json_extract(data,'$.email')),lower(?))>0)");args.push(search,search);}
 const where=clauses.join(' AND ');
 try{
  const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM workspaces WHERE '+where).bind(...args).first();
  const result=await env.DB.prepare('SELECT data FROM workspaces WHERE '+where+' ORDER BY id LIMIT ? OFFSET ?').bind(...args,limit,page*limit).all();
  const rows=(result.results||[]).map(r=>JSON.parse(r.data));
  // Never expose medical documents, bank information, private notes or role claims through the directory.
  return Response.json({total:Number(count?.total||0),page,limit,accounts:rows.map(a=>({uid:a.uid,fullName:a.fullName,email:a.email,role:a.role,status:a.status,createdAt:a.createdAt,serviceArea:a.application?.serviceArea||'',emailVerified:!!a.emailVerifiedAt}))},{headers});
 }catch{return Response.json({error:'The account directory is unavailable. Please retry.'},{status:503,headers});}
}
