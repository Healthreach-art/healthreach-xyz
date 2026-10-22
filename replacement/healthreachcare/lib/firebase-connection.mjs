import existingConfig from "../config/firebase-web.json" with {type:"json"};
// Public web configuration is explicitly allowlisted; never return runtime secrets.
export function firebaseConnection(env={}) {
 let input={};try{input=env.FIREBASE_WEB_CONFIG?JSON.parse(env.FIREBASE_WEB_CONFIG):existingConfig;}catch{return {enabled:false,googleEnabled:false,reason:'Firebase Web App configuration is invalid.'};}
 const complete=['apiKey','authDomain','projectId','appId'].every(k=>typeof input[k]==='string'&&input[k].trim());
 const safe=complete&&/^[a-z0-9][a-z0-9-]{3,61}[a-z0-9]$/.test(input.projectId)&&/^[a-z0-9.-]+$/.test(input.authDomain)&&!input.authDomain.includes('..');
 const enabled=env.FIREBASE_AUTH_ENABLED==='true'&&!!safe;
 return {enabled,googleEnabled:enabled&&env.FIREBASE_GOOGLE_ENABLED==='true',registrationEnabled:enabled&&env.FIREBASE_REGISTRATION_ENABLED==='true',...(enabled?{config:Object.fromEntries(['apiKey','authDomain','projectId','appId'].map(k=>[k,input[k]]))}:{reason:'Secure account access is awaiting the existing Firebase project configuration.'})};
}
export function safeAuthError(error){
 const code=error?.code||'';
 if(['auth/invalid-email','auth/missing-email'].includes(code))return 'Enter a valid email address.';
 if(['auth/invalid-credential','auth/user-not-found','auth/wrong-password','auth/user-disabled'].includes(code))return 'Sign-in failed. Check your details or contact support.';
 if(code==='auth/email-already-in-use')return 'An account may already use this email. Try signing in or resetting your password.';
 if(['auth/weak-password','auth/password-does-not-meet-requirements'].includes(code))return 'Choose a stronger password that meets the account security requirements.';
 if(code==='auth/too-many-requests')return 'Too many attempts. Please wait before trying again.';
 if(code==='auth/popup-closed-by-user')return 'Google sign-in was cancelled. You can try again.';
 if(code==='auth/popup-blocked')return 'Your browser blocked the sign-in window. Allow it and try again.';
 if(code==='auth/unauthorized-domain')return 'Sign-in is not yet enabled for this website address. Contact support.';
 if(code==='auth/operation-not-allowed')return 'This sign-in method is not enabled. Contact support.';
 if(code==='auth/network-request-failed')return 'Unable to connect. Check your connection and try again.';
 return 'The request could not be completed. Please try again or contact support.';
}
