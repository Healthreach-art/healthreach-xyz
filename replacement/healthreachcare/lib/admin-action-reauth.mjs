const expiredMessage='Confirm your sign-in again before changing administrator access.';

export function requiresAdminReauthentication(error){
 return String(error||'').toLowerCase().includes(expiredMessage.toLowerCase());
}

export async function reauthenticateAndRetryAdminAction({reauthenticate,password='',pendingAction,retry}){
 await reauthenticate(password);
 if(!pendingAction)return {retried:false,value:null};
 return {retried:true,value:await retry(pendingAction)};
}
