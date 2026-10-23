export class AccountValidationError extends Error {}
export const providerRoles=['Pharmacy','Doctor','Homecare','Driver'];
export const accountRoles=['Patient',...providerRoles];
export function accountKey(project,uid){return `firebase-account:${project}:${uid}`;}
function required(value,label,max=240){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new AccountValidationError(`${label} is required (up to ${max} characters).`);return value.trim();}
export function changeAccount(current,input,identity,now=new Date().toISOString()){
 if(!identity.emailVerified&&input.action!=='register')throw new AccountValidationError('Confirm your email before saving account details.');
 const action=input.action;let next=structuredClone(current);
 if(action==='register'){
  if(current)return current;
  const role=input.role||'Patient';if(!accountRoles.includes(role))throw new AccountValidationError('Choose a supported account type.');
  const phone=typeof input.phone==='string'?input.phone.trim():'';if(phone&&!/^[+0-9() .-]{7,40}$/.test(phone))throw new AccountValidationError('Enter a valid mobile number.');
  next={phone,uid:identity.uid,email:identity.email,fullName:required(input.fullName||identity.displayName,'Full name',120),role,status:role==='Patient'?'Active':'Incomplete',address:'',application:{},documents:[],audit:[],createdAt:now};
 }else{
  if(!current)throw new AccountValidationError('Complete your account setup first.');
  if(action==='profile'){
   next.fullName=required(input.fullName,'Full name',120);next.address=required(input.address,'Address',600);
  }else if(action==='application'){
   if(!providerRoles.includes(current.role))throw new AccountValidationError('Provider account required.');
   if(['Pending verification','Approved'].includes(current.status))throw new AccountValidationError('Your submitted application cannot be changed during review or after approval. Contact support for changes.');
   required(current.address,'Save your business or service address in your profile first',600);
   next.application={businessName:required(input.businessName,'Practice, business or service name',180),registration:required(input.registration,current.role==='Driver'?'Driving licence reference':'Professional or business registration reference',180),serviceArea:required(input.serviceArea,'Service area',240),phone:required(input.phone,'Contact phone',40),experience:required(input.experience,'Services and qualifications',2000)};
   next.status='Pending verification';next.rejectionReason='';next.submittedAt=now;
  }else if(action==='document'){
   if(!providerRoles.includes(current.role)||['Pending verification','Approved'].includes(current.status))throw new AccountValidationError('Documents can be added while completing or correcting your application.');
   if(current.documents.length>=8)throw new AccountValidationError('A maximum of 8 supporting documents can be stored.');
   if(!input.document?.key||!input.document?.name)throw new AccountValidationError('The document could not be stored.');next.documents.push(input.document);
  }else if(action==='review'){
   if(!identity.admin)throw new AccountValidationError('Verified administrator permission required.');
   if(current.status!=='Pending verification')throw new AccountValidationError('This application is not awaiting review.');
   if(!['Approved','Rejected'].includes(input.decision))throw new AccountValidationError('Choose approve or reject.');
   if(input.decision==='Approved'&&input.reviewed!==true)throw new AccountValidationError('Confirm that the required checks have been completed before approval.');
   next.status=input.decision;next.rejectionReason=input.decision==='Rejected'?required(input.reason,'Rejection reason',1200):'';next.reviewedAt=now;next.reviewedBy=identity.uid;
  }else throw new AccountValidationError('Unsupported account action.');
 }
 next.updatedAt=now;next.audit.push({action,actor:identity.uid,at:now,...(action==='review'?{decision:next.status,reason:next.rejectionReason}:{})});return next;
}
export function accountReady(account,identity){return !!identity.emailVerified&&!!account?.fullName&&!!account?.address&&(account.role!=='Patient'||identity.hasPassword);}
