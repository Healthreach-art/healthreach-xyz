import {env} from 'cloudflare:workers';
import {accountIdentity} from '../../../../lib/account-store.mjs';
export const dynamic='force-dynamic';
export async function GET(req){
 try{const value=req.headers.get('authorization')||'';if(!value.startsWith('Bearer '))return Response.json({error:'Sign in to continue'},{status:401});const identity=await accountIdentity(req,env);
 return Response.json({...identity,accessState:identity.emailVerified?'Account setup':'Email verification required',dashboardAccess:identity.emailVerified},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'Unable to confirm your account. Sign in again or contact support.'},{status:401,headers:{'Cache-Control':'no-store'}});}
}
