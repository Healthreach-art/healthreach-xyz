import {safeReturnTo} from './demo-access.mjs';
import {accountDestination} from './account-destination.mjs';

// Entry pages own their Firebase session. Workspace polling must not replace them.
export function isAuthEntry(pathname){return ['/login','/signup','/partners','/partners/login','/admin/login','/homecare/login'].includes(pathname);}
export function authEntryMode(pathname){return isAuthEntry(pathname)?(['/signup','/partners'].includes(pathname)?'signup':'login'):'';}
export function signInDestination(identity,account,{adminOnly=false,returnTo=''}={}){
 if(!identity?.emailVerified)return null;
 if(adminOnly&&!identity.admin)return null;
 if(identity.admin)return '/dashboard/admin/overview';
 const home=accountDestination(account,identity);
 if(!home)return '/account';
 const intended=safeReturnTo(returnTo);
 const rolePrefix=home.split('/').slice(0,3).join('/')+'/';
 return intended.startsWith(rolePrefix)?intended:home;
}
export function brandClick(previous,now){
 const count=previous&&now-previous.started<=1500?previous.count+1:1;
 return count===3?{count:0,started:now,openAdmin:true}:{count,started:count===1?now:previous.started,openAdmin:false};
}
