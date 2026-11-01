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
  const role=input.role||'Patient';if(role==='Homecare')throw new AccountValidationError('Homecare staff accounts are managed by HealthReachCare administrators. Use partner login for an existing account.');if(!accountRoles.includes(role))throw new AccountValidationError('Choose a supported account type.');
  const phone=typeof input.phone==='string'?input.phone.trim():'';if(phone&&!/^[+0-9() .-]{7,40}$/.test(phone))throw new AccountValidationError('Enter a valid mobile number.');
  next={phone,uid:identity.uid,email:identity.email,fullName:required(input.fullName||identity.displayName,'Full name',120),role,status:role==='Patient'?'Active':'Pending verification',address:'',application:{},documents:[],audit:[],createdAt:now};
 }else{
  if(!current)throw new AccountValidationError('Complete your account setup first.');
  if(action==='homecareStaff'){
   if(!identity.admin||!current.emailVerifiedAt||!['Patient','Homecare'].includes(current.role))throw new AccountValidationError('Choose a verified patient or existing Homecare staff account.');
   if(!['Approved','Suspended','On hold'].includes(input.decision))throw new AccountValidationError('Choose a valid staff status.');
   next.role='Homecare';next.status=input.decision;next.statusReason=required(input.reason,'Reason',1200);next.companyStaff=true;next.reviewedAt=now;next.reviewedBy=identity.uid;
  }else if(action==='profile'){
   next.fullName=required(input.fullName,'Full name',120);if(current.role==='Patient')next.address=required(input.address,'Address',600);else if(typeof input.address==='string'&&input.address.trim())next.address=required(input.address,'Address',600);
  }else if(action==='application'){
   if(!providerRoles.includes(current.role))throw new AccountValidationError('Provider account required.');
   if(current.status==='Approved'||current.status==='Pending verification'&&current.submittedAt)throw new AccountValidationError('Your submitted application cannot be changed during review or after approval. Contact support for changes.');
   const location=input.location||current.address||input.serviceArea;
   const publicProfile={name:required(input.name||input.businessName||current.fullName,'Public display name',120),description:required(input.description||input.experience,'Public description',600),location:required(location,'Public service address or base area',600),serviceArea:required(input.serviceArea,'Service area',240),phone:required(input.phone,'Contact phone',40),openTime:typeof input.openTime==='string'&&input.openTime?input.openTime:'00:00',closeTime:typeof input.closeTime==='string'&&input.closeTime?input.closeTime:'23:59',...(current.role==='Driver'?{vehicle:required(input.vehicle,'Vehicle type',80),licenceClass:typeof input.licenceClass==='string'?input.licenceClass.trim().slice(0,50):''}:{})};
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(publicProfile.openTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(publicProfile.closeTime)||publicProfile.openTime>=publicProfile.closeTime)throw new AccountValidationError('Enter valid opening and closing hours.');
   if(current.role==='Pharmacy'){
    const latitude=Number(input.latitude),longitude=Number(input.longitude);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude < -34.45||latitude > -33.45||longitude < 18.15||longitude > 19.15)throw new AccountValidationError('Choose a Cape Town pharmacy address suggestion or use current location so customers can see an accurate distance.');
    publicProfile.coordinates={latitude,longitude};
   }
   next.application={...(current.application||{}),businessName:publicProfile.name,registration:typeof input.registration==='string'?input.registration.trim().slice(0,180):'',serviceArea:publicProfile.serviceArea,phone:publicProfile.phone,experience:publicProfile.description,publicProfile};
   next.status='Pending verification';next.rejectionReason='';next.submittedAt=now;
  }else if(action==='deleteSelf'){
   if(!identity.emailVerified)throw new AccountValidationError('Verify your email before requesting account deletion.');
   if(current.role!=='Patient')throw new AccountValidationError('Use the account support process to request deletion of a provider account.');
   next.status='Deleted';next.deletedAt=now;next.deletedBy=identity.uid;next.fullName='Deleted account';next.email='';next.address='';next.phone='';next.application={};next.documents=[];next.rejectionReason='';next.statusReason='Account deleted by account holder';
  }else if(action==='document'){
   if(!providerRoles.includes(current.role)||['Pending verification','Approved'].includes(current.status))throw new AccountValidationError('Documents can be added while completing or correcting your application.');
   if(current.documents.length>=8)throw new AccountValidationError('A maximum of 8 supporting documents can be stored.');
   if(!input.document?.key||!input.document?.name)throw new AccountValidationError('The document could not be stored.');next.documents.push(input.document);
  }else if(action==='requestReview'){if(!providerRoles.includes(current.role)||!['Rejected','Incomplete'].includes(current.status))throw new AccountValidationError('Only a rejected or incomplete partner account can request another review.');next.status='Pending verification';next.submittedAt=now;next.rejectionReason='';next.statusReason='';
  }else if(action==='review'){
   if(!identity.admin)throw new AccountValidationError('Verified administrator permission required.');
   if(!providerRoles.includes(current.role)&&!(current.role==='Patient'&&input.decision==='Deleted'))throw new AccountValidationError('Choose a partner or patient account.');
   if(!['Approved','Rejected','Suspended','On hold','Deleted'].includes(input.decision))throw new AccountValidationError('Choose a supported account status.');
   if(input.decision==='Approved'&&input.reviewed!==true)throw new AccountValidationError('Complete the public-profile check before approval.');
   next.status=input.decision;next.rejectionReason=['Rejected','Suspended','On hold'].includes(input.decision)?required(input.reason,'Reason',1200):'';next.reviewedAt=now;next.reviewedBy=identity.uid;next.statusReason=next.rejectionReason;
   if(input.decision==='Deleted'){next.deletedAt=now;next.deletedBy=identity.uid;next.fullName='Deleted account';next.email='';next.address='';next.phone='';next.application={};next.documents=[];next.rejectionReason='';next.statusReason='Account deleted by administrator';}
  }else throw new AccountValidationError('Unsupported account action.');
 }
 next.updatedAt=now;next.audit.push({action,actor:identity.uid,at:now,...(action==='review'?{decision:next.status,reason:next.rejectionReason}:{})});return next;
}
export function accountReady(account,identity){return !!identity.emailVerified&&!!account?.fullName&&(account.role!=='Patient'||!!account.address&&identity.hasPassword);}
