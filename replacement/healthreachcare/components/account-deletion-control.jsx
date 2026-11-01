'use client';
import {useState} from 'react';
import {accountRequest,firebaseClient} from '../lib/firebase-client.mjs';

export function AccountDeletionControl(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function remove(){
  if(!window.confirm('Permanently delete your HealthReachCare account? Direct profile details and private documents will be removed. Financial and booking history will be anonymized and retained.'))return;
  setBusy(true);setError('');
  try{
   const {auth,sdk}=await firebaseClient();await auth.authStateReady();const user=auth.currentUser;if(!user)throw Error('Sign in again to continue.');
   const provider=user.providerData?.[0]?.providerId;
   if(provider==='password'){
    const password=window.prompt('For security, enter your password to confirm account deletion.');if(password===null)return;
    await sdk.reauthenticateWithCredential(user,sdk.EmailAuthProvider.credential(user.email,password));
   }else if(provider==='google.com'){
    const google=new sdk.GoogleAuthProvider();google.setCustomParameters({prompt:'select_account'});await sdk.reauthenticateWithPopup(user,google);
   }
   await accountRequest('deleteSelf');
   await sdk.deleteUser(user);
   window.location.replace('/');
  }catch(e){setError(e.message||'Account deletion could not be completed.');}
  finally{setBusy(false);}
 }
 return <div className="account-delete-control"><button type="button" className="outline danger" disabled={busy} onClick={remove}>{busy?'Deleting account…':'Delete my account'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
