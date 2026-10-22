import {createRemoteJWKSet,jwtVerify} from 'jose';
import {firebaseConnection} from './firebase-connection.mjs';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export async function verifyFirebaseIdentity(token,env,{keySet=keys,request=fetch}={}){
 const connection=firebaseConnection(env);if(!connection.enabled)throw Error('Authentication is not configured');
 if(typeof token!=='string'||token.length>16384||!token)throw Error('Authentication required');
 const project=connection.config.projectId;
 const {payload}=await jwtVerify(token,keySet,{algorithms:['RS256'],issuer:'https://securetoken.google.com/'+project,audience:project,requiredClaims:['sub','iat','exp','auth_time']});
 if(!payload.sub||payload.sub.length>128||!Number.isFinite(payload.auth_time)||payload.auth_time>Date.now()/1000||payload.iat>Date.now()/1000)throw Error('Invalid identity');
 // Firebase confirms the current account is present/enabled; no Admin key or account-write permission.
 const response=await request('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(connection.config.apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Identity confirmation failed');const data=await response.json();const user=data.users?.find(u=>u.localId===payload.sub);
 if(!user||user.disabled||Number(user.validSince||0)>payload.auth_time)throw Error('Account unavailable');
 return {uid:payload.sub,email:typeof user.email==='string'?user.email:null,emailVerified:user.emailVerified===true,displayName:typeof user.displayName==='string'?user.displayName:'',hasPassword:user.providerUserInfo?.some(p=>p.providerId==='password')===true,admin:payload.admin===true&&user.emailVerified===true};
}
