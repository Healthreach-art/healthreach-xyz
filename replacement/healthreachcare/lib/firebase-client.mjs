import {validPassword,passwordHelp} from './password-policy.mjs';
let connectionPromise;
export async function firebaseClient(){
 if(!connectionPromise)connectionPromise=(async()=>{
 const r=await fetch('/api/auth/config',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Account configuration is unavailable');const connection=await r.json();if(!connection.enabled)throw Error('Account access is not configured');
 const [{initializeApp,getApps},sdk]=await Promise.all([import('firebase/app'),import('firebase/auth')]);
 const app=getApps().find(a=>a.name==='healthreachcare-auth')||initializeApp(connection.config,'healthreachcare-auth');const auth=sdk.getAuth(app);
 // Persist until explicit sign-out using Firebase-managed browser storage.
 await sdk.setPersistence(auth,sdk.browserLocalPersistence);return {auth,sdk,connection};
 })().catch(e=>{connectionPromise=undefined;throw e;});return connectionPromise;
}
export async function authenticateAccount({email,password,fullName,signup=false,google=false}){
 const {auth,sdk,connection}=await firebaseClient();let credential;
 if(google){if(!connection.googleEnabled)throw Error('Google sign-in is not configured');const provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});credential=await sdk.signInWithPopup(auth,provider);}
 else if(signup){if(!validPassword(password))throw Error(passwordHelp);if(!fullName?.trim())throw Error('Enter your full name');if(!connection.registrationEnabled)throw Error('Registration is not configured');credential=await sdk.createUserWithEmailAndPassword(auth,email,password);await sdk.updateProfile(credential.user,{displayName:fullName.trim()});}
 else credential=await sdk.signInWithEmailAndPassword(auth,email,password);
 return credential.user;
}
export async function resetAccountPassword(email){const {auth,sdk}=await firebaseClient();await sdk.sendPasswordResetEmail(auth,email);}
export async function verifyAccountEmail(){const {auth,sdk}=await firebaseClient();if(!auth.currentUser)throw Error('Sign in first');await sdk.sendEmailVerification(auth.currentUser);}
export async function inspectAccount(){const {auth,sdk}=await firebaseClient();await auth.authStateReady();if(!auth.currentUser)return null;await sdk.reload(auth.currentUser);const token=await auth.currentUser.getIdToken(true);const r=await fetch('/api/auth/identity',{cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('Account identity could not be confirmed');return r.json();}
export async function endFirebaseSession(){const {auth,sdk}=await firebaseClient();await sdk.signOut(auth);}

export async function accountRequest(action,values={}){const {auth}=await firebaseClient();await auth.authStateReady();if(!auth.currentUser)throw Error('Sign in to continue');const token=await auth.currentUser.getIdToken();const r=await fetch('/api/account',{signal:AbortSignal.timeout(20000),method:action?'POST':'GET',headers:{Authorization:'Bearer '+token,...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify({action,...values})}:{}),cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to save. Please retry.');return data;}
export async function setAccountPassword(password){if(!validPassword(password))throw Error(passwordHelp);const {auth,sdk}=await firebaseClient();if(!auth.currentUser?.email)throw Error('Sign in to continue');if(auth.currentUser.providerData.some(p=>p.providerId==='password'))throw Error('A password is already set. Use password recovery to change it.');await sdk.linkWithCredential(auth.currentUser,sdk.EmailAuthProvider.credential(auth.currentUser.email,password));}

export async function firebaseWorkspaceHeaders(){const {auth}=await firebaseClient();await auth.authStateReady();return auth.currentUser?{Authorization:'Bearer '+await auth.currentUser.getIdToken()}:{};}
