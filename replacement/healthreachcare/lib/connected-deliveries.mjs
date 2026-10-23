import {offerEligible,maintainBusiness} from './business.mjs';
const active=r=>r?.isOrder===true&&r.payment==='Paid'&&!['Cancelled','Delivered','Declined'].includes(r.status)&&!r.cancellationRequested&&r.exception?.status!=='Open'&&(r.type!=='Prescription'||r.prescriptionApproved&&r.verification&&(!r.requiresDocuments||r.identity?.status==='Verified'));
export const deliveryActions=['driverSettings','claimDelivery','driverProgress','declineDeliveryOffer','issueHandoverCode','verifyHandoverCode'];
export function handleConnectedDelivery(c){
 const {s,p,action,session,now,event,check}=c;
 if(!deliveryActions.includes(action)||['issueHandoverCode','verifyHandoverCode'].includes(action))return false;
 check(['Driver']);const driver=s.drivers[session.accountId];if(!driver||driver.status!=='Approved')throw Error('Only an approved driver can manage delivery availability or tasks.');
 if(action==='driverSettings'){if(typeof p.serviceArea!=='string'||!p.serviceArea.trim()||p.serviceArea.length>150)throw Error('Enter the cities you serve.');driver.serviceArea=p.serviceArea.trim();driver.online=p.online===true;return true;}
 const t=s.deliveryTasks.find(t=>t.id===p.taskId),r=s.records.find(r=>r.id===t?.recordId);
 if(!t||!active(r)||r.fulfilment!=='Delivery')throw Error('This delivery is not eligible.');
 if(action==='declineDeliveryOffer'){if(t.driverId||!offerEligible(s,t,driver))throw Error('This offer is no longer available.');t.declinedBy=[...new Set([...(t.declinedBy||[]),driver.id])];return true;}
 if(action==='claimDelivery'){
  if(!driver.online||t.driverId||!offerEligible(s,t,driver)||t.declinedBy?.includes(driver.id))throw Error('This delivery is no longer eligible.');
  Object.assign(t,{driverId:driver.id,driver:driver.name,status:'Assigned',updated:now,agreedEarnings:t.proposedEarnings??r.deliveryFee??0,history:[{status:'Assigned',at:now,actor:driver.name}]});event(r,'Driver assigned','Assigned to '+driver.name);
 }else{
  if(t.driverId!==driver.id)throw Error('Only the assigned driver can update this delivery.');
  const next={Assigned:'Arrived at pickup',Collected:'En route','En route':'Arrived at destination'};
  if(next[t.status]!==p.status)throw Error('Use the permitted delivery step and one-time handover verification for pickup and delivery.');
  t.status=p.status;t.updated=now;t.history??=[];t.history.push({status:t.status,at:now,actor:driver.name});event(r,t.pickupVerified?'Out for delivery':'Driver assigned','Delivery: '+t.status);
 }
 for(const recipientId of [r.patientId,r.providerId,driver.id])s.notifications.unshift({id:crypto.randomUUID(),recipientId,recordId:r.id,title:'Delivery updated',message:t.status,type:'Orders',at:now,read:false});
 maintainBusiness(s);return true;
}
