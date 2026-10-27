import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isAuthEntry,authEntryMode,signInDestination,brandClick,dashboardLoginPath} from '../lib/auth-entry.mjs';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
for(const route of ['/login','/signup','/partners/login','/partners/signup','/admin/login'])eq(isAuthEntry(route),true);
eq(isAuthEntry('/partners'),false);
for(const route of ['/','/dashboard/admin/overview','/dashboard/patient/home'])eq(isAuthEntry(route),false);
for(const route of ['/partners/signup','/signup'])eq(authEntryMode(route),'signup');
eq(authEntryMode('/partners'),'');
for(const route of ['/partners/login','/admin/login','/login'])eq(authEntryMode(route),'login');
eq(authEntryMode('/'),'');
const verified={emailVerified:true,hasPassword:true,admin:false};
for(const [role,slug] of [['Patient','patient'],['Pharmacy','pharmacy'],['Doctor','doctor'],['Homecare','homecare'],['Driver','driver']]){
 const account={role,fullName:'Fictional test account',status:'Approved'};
 const home='/dashboard/'+slug+'/'+(role==='Patient'?'home':'overview');
 eq(signInDestination(verified,account),home);
 eq(signInDestination(verified,account,{returnTo:'/dashboard/'+slug+'/account'}),'/dashboard/'+slug+'/account');
 eq(signInDestination(verified,account,{returnTo:'/dashboard/admin/overview'}),home);
 eq(signInDestination(verified,account,{adminOnly:true}),null);
 eq(signInDestination({...verified,emailVerified:false},account),null);
 if(role!=='Patient')for(const status of ['Incomplete','Pending verification','Rejected'])eq(signInDestination(verified,{...account,status}),home);
}
eq(signInDestination({...verified,admin:true},{},{adminOnly:true}),'/dashboard/admin/overview');
eq(dashboardLoginPath('/dashboard/patient/home'),'/login?returnTo=%2Fdashboard%2Fpatient%2Fhome');
eq(dashboardLoginPath('/dashboard/pharmacy/orders'),'/partners/login?returnTo=%2Fdashboard%2Fpharmacy%2Forders&role=Pharmacy');
eq(dashboardLoginPath('/dashboard/doctor/appointments'),'/partners/login?returnTo=%2Fdashboard%2Fdoctor%2Fappointments&role=Doctor');
eq(dashboardLoginPath('/dashboard/driver/deliveries'),'/partners/login?returnTo=%2Fdashboard%2Fdriver%2Fdeliveries&role=Driver');
eq(dashboardLoginPath('/dashboard/homecare/bookings'),'/homecare/login?returnTo=%2Fdashboard%2Fhomecare%2Fbookings');
eq(dashboardLoginPath('/dashboard/admin/overview'),'/admin/login?returnTo=%2Fdashboard%2Fadmin%2Foverview');
eq(dashboardLoginPath('//evil.example'),'/login');
eq(signInDestination({...verified,admin:true},{},{adminOnly:true,returnTo:'/dashboard/admin/reports'}),'/dashboard/admin/reports');
eq(signInDestination({...verified,homecareStaff:true},{role:'Homecare',status:'Approved'},{homecareOnly:true,returnTo:'/dashboard/homecare/bookings'}),'/dashboard/homecare/bookings');
eq(signInDestination({...verified,hasPassword:false},{role:'Patient',fullName:'Fixture'}),'/account');
let state=brandClick(null,100);eq(state.openAdmin,false);state=brandClick(state,400);eq(state.openAdmin,false);state=brandClick(state,650);eq(state.openAdmin,true);
state=brandClick(state,800);eq(state.openAdmin,false);state=brandClick(state,2400);eq(state.count,1);state=brandClick(state,2500);eq(state.openAdmin,false);
// Regression: the workspace poll exits on entry routes before it can redirect or erase the signup form.
const app=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');assert(app.includes('async function load(){if(isAuthEntry(window.location.pathname))return true;'));checks++;assert(app.includes('setAuthScreen(authEntryMode(window.location.pathname))'));checks++;assert(!app.includes("setAuthScreen(['/login','/signup']"));checks++;
assert(app.includes('dashboardLoginPath(window.location.pathname+window.location.search)'));checks++;
console.log(`${checks} auth-entry routing, triple-click and role isolation checks passed; no real accounts created.`);
