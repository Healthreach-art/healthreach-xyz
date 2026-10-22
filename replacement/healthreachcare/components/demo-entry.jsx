'use client';
import {useEffect,useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';
import {entryPath} from '../lib/demo-access.mjs';
import {safeAuthError} from '../lib/firebase-connection.mjs';
import {authenticateAccount,resetAccountPassword,verifyAccountEmail,inspectAccount} from '../lib/firebase-client.mjs';

export function DemoEntry({mode='login',onPublic,returnTo=''}) {
 const [visible,setVisible]=useState(false),[feedback,setFeedback]=useState('');
 const [config,setConfig]=useState(null),[working,setWorking]=useState(false);
 const signup=mode==='signup';
 useEffect(()=>{let active=true;fetch('/api/auth/config',{cache:'no-store'}).then(r=>r.json()).then(c=>{if(active)setConfig(c)}).catch(()=>{if(active)setConfig({enabled:false})});return()=>{active=false}},[]);
 async function submit(e){
  e.preventDefault();if(working)return;setWorking(true);setFeedback('');
  const data=new FormData(e.currentTarget),email=String(data.get('email')||'').trim(),password=String(data.get('password')||'');
  try{
   if(signup){
    await authenticateAccount({email,password,signup:true});
    await verifyAccountEmail();
    setFeedback('Check your email to verify your address. Your account will require an approved role link before dashboard access.');
   }else{
    await authenticateAccount({email,password});
    const identity=await inspectAccount();
    setFeedback(identity?.dashboardAccess?'Account verified.':'Signed in successfully. '+(identity?.accessState||'Account link required')+'. Dashboard access is not yet available.');
   }
  }catch(error){setFeedback(error?.code?safeAuthError(error):error?.message||'Unable to sign in.');}
  finally{setWorking(false)}
 }
 async function resetPassword(){
  if(working)return;setWorking(true);setFeedback('');
  try{const email=document.getElementById('login-email')?.value?.trim();if(!email)throw Error('Enter your email address first.');await resetAccountPassword(email);setFeedback('If an account exists for this email, a password reset message will be sent.');}
  catch(error){setFeedback(error?.code?safeAuthError(error):error?.message||'Password recovery is unavailable.');}
  finally{setWorking(false)}
 }
 return <section className="auth-card" aria-labelledby="auth-title"><div className="eyebrow">HealthReachCare</div><h1 id="auth-title">{signup?'Create your account':'Welcome back'}</h1><p>{signup?'Join HealthReachCare.':'Sign in to access your HealthReachCare account.'}</p>{!config?.enabled&&<div className="auth-service-notice" role="note">Firebase account access is not enabled on this deployment yet. Contact <a href="mailto:support@healthreachcare.co.za">support@healthreachcare.co.za</a> for assistance.</div>}<form onSubmit={submit}><label htmlFor="login-email">Email address</label><input id="login-email" name="email" type="email" autoComplete="username" required maxLength={254}/><label htmlFor="login-password">Password</label><div className="auth-password"><input id="login-password" name="password" type={visible?'text':'password'} autoComplete={signup?'new-password':'current-password'} required/><button type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={20}/>:<Eye size={20}/>}</button></div><button type="button" className="auth-recovery" onClick={resetPassword} disabled={working}>Forgot password?</button>{feedback&&<p className="auth-feedback" role="alert">{feedback}</p>}<button className="auth-submit" type="submit" disabled={working||!config?.enabled||signup&&!config?.registrationEnabled}>{working?'Please wait…':signup?'Sign Up':'Log In'}</button></form><p className="auth-switch">{signup?'Already have an account?':'New to HealthReachCare?'} <a href={entryPath(signup?'login':'signup',returnTo)}>{signup?'Log In':'Sign Up'}</a></p><button type="button" className="auth-back" onClick={onPublic}>← Back to HealthReachCare</button></section>;
}
