let connectionPromise;
export async function firebaseClient(){
 if(!connectionPromise)connectionPromise=(async()=>{
 const r=await fetch('/api/auth/config',{cache:'no-store'});if(!r.ok)throw Error('Account configuration is unavailable');const connection=await r.json();if(!connection.enabled)throw Error('Account access is not configured');
 const [{initializeApp,getApps},sdk]=await Promise.all([import('firebase/app'),import('firebase/auth')]);
 const app=getApps().find(a=>a.name==='healthreachcare-auth')||initializeApp(connection.config,'healthreachcare-auth');const auth=sdk.getAuth(app);
 // Browser-session persistence; no additional remember-me or third-party data scopes.
 await sdk.setPersistence(auth,sdk.browserSessionPersistence);return {auth,sdk,connection};
 })().catch(e=>{connectionPromise=undefined;throw e;});return connectionPromise;
}
export async function authenticateAccount({email,password,signup=false,google=false}){
 const {auth,sdk,connection}=await firebaseClient();let credential;
 if(google){if(!connection.googleEnabled)throw Error('Google sign-in is not configured');const provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});credential=await sdk.signInWithPopup(auth,provider);}
 else if(signup){if(!connection.registrationEnabled)throw Error('Registration is not configured');credential=await sdk.createUserWithEmailAndPassword(auth,email,password);}
 else credential=await sdk.signInWithEmailAndPassword(auth,email,password);
 return credential.user;
}
export async function resetAccountPassword(email){const {auth,sdk}=await firebaseClient();await sdk.sendPasswordResetEmail(auth,email);}
export async function verifyAccountEmail(){const {auth,sdk}=await firebaseClient();if(!auth.currentUser)throw Error('Sign in first');await sdk.sendEmailVerification(auth.currentUser);}
export async function inspectAccount(){const {auth,sdk}=await firebaseClient();await auth.authStateReady();if(!auth.currentUser)return null;await sdk.reload(auth.currentUser);const token=await auth.currentUser.getIdToken(true);const r=await fetch('/api/auth/identity',{cache:'no-store',headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('Account identity could not be confirmed');return r.json();}
export async function endFirebaseSession(){const {auth,sdk}=await firebaseClient();await sdk.signOut(auth);}
