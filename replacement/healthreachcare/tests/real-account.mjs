import assert from 'node:assert/strict';
import {changeAccount,accountReady,accountKey,providerRoles} from '../lib/real-account.mjs';
import {validPassword} from '../lib/password-policy.mjs';
const patient={uid:'fictional-patient',email:'patient@example.test',emailVerified:true,hasPassword:true,displayName:'Fixture Patient',admin:false};
let checks=0;const check=value=>{assert(value);checks++;};const rejects=(fn,match)=>{assert.throws(fn,match);checks++;};
for(const password of ['abc12','abcdef','123456','      ','abcdef '])check(!validPassword(password));
for(const password of ['abc123','abcdef!','Fixture-Pass1'])check(validPassword(password));
const pending=changeAccount(null,{action:'register'},{...patient,emailVerified:false});check(!accountReady(pending,{...patient,emailVerified:false}));rejects(()=>changeAccount(pending,{action:'profile'},{...patient,emailVerified:false}),/Confirm your email/);
rejects(()=>changeAccount(null,{action:'register',role:'Admin'},patient),/supported account type/);
let account=changeAccount(null,{action:'register',role:'Patient'},patient);check(account.role==='Patient');check(account.status==='Active');check(!accountReady(account,patient));
account=changeAccount(account,{action:'profile',fullName:'Fixture Updated',address:'Fictional test address'},patient);check(accountReady(account,patient));check(!accountReady(account,{...patient,hasPassword:false}));check(account.audit.length===2);check(account.fullName==='Fixture Updated');
const rejoin=changeAccount(account,{action:'register',role:'Pharmacy'},patient);check(rejoin.role==='Patient');check(accountKey('test-project',patient.uid).startsWith('firebase-account:test-project:'));rejects(()=>changeAccount(account,{action:'application'},patient),/Provider account/);
for(const role of providerRoles.filter(r=>r!=='Homecare')){
 const owner={...patient,uid:'fixture-'+role};let provider=changeAccount(null,{action:'register',role,fullName:'Fixture '+role},owner);check(provider.status==='Pending verification');check(provider.role===role);provider.status='Incomplete';
 const application={action:'application',businessName:'Fictional practice',registration:'TEST-REG-ONLY',phone:'+27 00 000 0000',serviceArea:'Fictional service area',experience:'Fictional service qualifications'};
 rejects(()=>changeAccount(provider,application,owner),/address/);provider=changeAccount(provider,{action:'profile',fullName:provider.fullName,address:'Fictional business location'},owner);
 provider=changeAccount(provider,{action:'document',document:{id:'fixture-file',key:'fictional-private-file',name:'fictional-proof.pdf'}},owner);check(provider.documents.length===1);
 provider=changeAccount(provider,application,owner);check(provider.status==='Pending verification');check(provider.submittedAt);check(!provider.rejectionReason);
 rejects(()=>changeAccount(provider,{action:'review',decision:'Approved',reviewed:true},owner),/administrator/);
 rejects(()=>changeAccount(provider,application,owner),/cannot be changed/);
 const admin={...patient,uid:'fictional-admin',admin:true};rejects(()=>changeAccount(provider,{action:'review',decision:'Rejected',reason:''},admin),/Reason/);rejects(()=>changeAccount(provider,{action:'review',decision:'Approved'},admin),/required checks/);
 provider=changeAccount(provider,{action:'review',decision:'Rejected',reason:'Fixture: registration document needs correction'},admin);check(provider.status==='Rejected');check(provider.rejectionReason.includes('correction'));check(provider.reviewedBy===admin.uid);
 provider=changeAccount(provider,application,owner);check(provider.status==='Pending verification');check(provider.rejectionReason==='');provider=changeAccount(provider,{action:'review',decision:'Approved',reviewed:true},admin);check(provider.status==='Approved');check(provider.documents.length===1);check(provider.audit.some(a=>a.decision==='Rejected'));check(provider.audit.at(-1).decision==='Approved');
 rejects(()=>changeAccount(provider,{action:'document',document:{key:'extra',name:'extra.pdf'}},owner),/correcting/);
}
const withPhone=changeAccount(null,{action:'register',role:'Patient',phone:' +27 71 123 4567 '},patient);check(withPhone.phone==='+27 71 123 4567');
check(changeAccount(withPhone,{action:'register',phone:'+27 82 000 0000'},patient).phone===withPhone.phone);
rejects(()=>changeAccount(null,{action:'register',phone:'invalid phone'},patient),/valid mobile/);
check(changeAccount(null,{action:'register'},patient).phone==='');
console.log(`${checks} real-account/password state and authorization assertions passed with fictional local data.`);

// Administrator controls retain related data; partners cannot self-approve or reactivate.
const admin={...patient,uid:'fixture-admin',admin:true};let controlled=changeAccount(null,{action:'register',role:'Doctor',fullName:'Fixture doctor'},patient);
check(controlled.status==='Pending verification');check(controlled.documents.length===0);
for(const decision of ['Approved','Suspended','On hold','Rejected','Approved','Deleted']){const before=structuredClone(controlled);rejects(()=>changeAccount(controlled,{action:'review',decision,reason:'Fixture reason',reviewed:true},patient),/administrator/);controlled=changeAccount(controlled,{action:'review',decision,reason:'Fixture reason',reviewed:true},admin);check(controlled.status===decision);check(controlled.uid===before.uid);check(controlled.documents.length===before.documents.length);if(decision==='Deleted')check(!!controlled.deletedAt);}
rejects(()=>changeAccount(controlled,{action:'review',decision:'On hold',reviewed:true},admin),/Reason/);check(controlled.audit.length===7);console.log('29 additional fast partner registration, administrator control, reason and soft-delete preservation assertions passed.');

rejects(()=>changeAccount(null,{action:'register',role:'Homecare'},patient),/administrators/);
rejects(()=>changeAccount({...account,emailVerifiedAt:'fixture'},{action:'homecareStaff',decision:'Approved',reason:'Fixture'},patient),/verified patient/);
const staff=changeAccount({...account,emailVerifiedAt:'fixture'},{action:'homecareStaff',decision:'Approved',reason:'Fixture staff approval'},admin);check(staff.role==='Homecare');check(staff.uid===account.uid);check(staff.companyStaff);check(staff.status==='Approved');
const suspended=changeAccount(staff,{action:'homecareStaff',decision:'Suspended',reason:'Fixture pause'},admin);check(suspended.status==='Suspended');check(suspended.audit.length===staff.audit.length+1);
console.log('Homecare public signup denial and admin-only staff provisioning checks passed');
