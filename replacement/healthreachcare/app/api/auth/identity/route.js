import {env} from 'cloudflare:workers';
import {verifyFirebaseIdentity} from '../../../../lib/firebase-server.mjs';
export const dynamic='force-dynamic';
export async function GET(req){
 try{const value=req.headers.get('authorization')||'';if(!value.startsWith('Bearer '))return Response.json({error:'Sign in to continue'},{status:401});const identity=await verifyFirebaseIdentity(value.slice(7),env);
 // Deliberately no role from email, browser input, or unreviewed custom claims. Existing
 // D1 demo sessions remain separate until a trusted production account mapping is provided.
 return Response.json({...identity,accessState:identity.emailVerified?'Account link required':'Email verification required',dashboardAccess:false},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'Unable to confirm your account. Sign in again or contact support.'},{status:401,headers:{'Cache-Control':'no-store'}});}
}
