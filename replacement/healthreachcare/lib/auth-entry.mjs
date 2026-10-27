import {safeReturnTo} from './demo-access.mjs';
import {accountDestination} from './account-destination.mjs';

// Entry pages own their Firebase session. Workspace polling must not replace them.
export function isAuthEntry(pathname){return ['/login','/signup','/partners/login','/partners/signup','/admin/login','/homecare/login'].includes(pathname);}
export function authEntryMode(pathname){return isAuthEntry(pathname)?(['/signup','/partners/signup'].includes(pathname)?'signup':'login'):'';}
export function dashboardLoginPath(returnTo=''){
 const intended=safeReturnTo(returnTo);if(!intended)return '/login';const role=intended.split('/')[2]?.toLowerCase(),params=new URLSearchParams({returnTo:intended});
 if(role==='admin')return '/admin/login?'+params;
 if(role==='homecare')return '/homecare/login?'+params;
 if(['pharmacy','doctor','driver'].includes(role)){params.set('role',role[0].toUpperCase()+role.slice(1));return '/partners/login?'+params;}
 return '/login?'+params;
}
export function signInDestination(identity,account,{adminOnly=false,homecareOnly=false,returnTo=''}={}){
 if(!identity?.emailVerified)return null;
 if(adminOnly&&!identity.admin)return null;
 if(homecareOnly&&!identity.homecareStaff)return null;
 const intended=safeReturnTo(returnTo);
 if(identity.admin)return intended.startsWith('/dashboard/admin/')?intended:'/dashboard/admin/overview';
 if(homecareOnly)return intended.startsWith('/dashboard/homecare/')?intended:'/dashboard/homecare/overview';
 const home=accountDestination(account,identity);
 if(!home)return '/account';
 const rolePrefix=home.split('/').slice(0,3).join('/')+'/';
 return intended.startsWith(rolePrefix)?intended:home;
}
export function brandClick(previous,now){
 const count=previous&&now-previous.started<=1500?previous.count+1:1;
 return count===3?{count:0,started:now,openAdmin:true}:{count,started:count===1?now:previous.started,openAdmin:false};
}
