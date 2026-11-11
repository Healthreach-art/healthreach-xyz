import {offerEligible,maintainBusiness} from './business.mjs';
const text=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw Error('Complete the required public profile fields.');return value.trim();};
const active=r=>r?.isOrder===true&&r.payment==='Paid'&&!['Cancelled','Delivered','Declined'].includes(r.status)&&!r.cancellationRequested&&r.exception?.status!=='Open'&&(r.type!=='Prescription'||r.prescriptionApproved&&r.verification&&(!r.requiresDocuments||r.identity?.status==='Verified'));
export const deliveryActions=['driverSettings','saveDriverPublicProfile','claimDelivery','driverProgress','declineDeliveryOffer','issueHandoverCode','verifyHandoverCode'];
export function handleConnectedDelivery(c){
 const {s,p,action,session,now,event,check}=c;
 if(!deliveryActions.includes(action)||['issueHandoverCode','verifyHandoverCode'].includes(action))return false;
 check(['Driver']);const driver=s.drivers[session.accountId];if(!driver||driver.status!=='Approved'&&action!=='saveDriverPublicProfile')throw Error('Only an approved driver can manage delivery availability or tasks.');
 if(action==='driverSettings'){if(typeof p.serviceArea!=='string'||!p.serviceArea.trim()||p.serviceArea.length>150)throw Error('Enter the cities you serve.');const profile=driver.publicProfile;if(p.online===true&&!(profile?.name&&profile?.description&&profile?.vehicle&&profile?.plate&&profile?.serviceArea))throw Error('Complete your Public profile, including the vehicle number plate, before going online.');driver.serviceArea=p.serviceArea.trim();driver.online=p.online===true;if(!driver.online)for(const [taskId,point] of Object.entries(s.deliveryLocations||{}))if(point.driverId===driver.id){delete s.deliveryLocations[taskId];const task=s.deliveryTasks.find(value=>value.id===taskId);if(task)task.lastLocationAt=point.at;}return true;}
 if(action==='saveDriverPublicProfile'){check(['Driver']);const name=text(p.name,100),description=text(p.description,500),vehicle=text(p.vehicle,80),plate=text(p.plate,20).toLocaleUpperCase(),serviceArea=text(p.serviceArea,150),vehicleColour=typeof p.vehicleColour==='string'?p.vehicleColour.trim().slice(0,50):'',licenceClass=typeof p.licenceClass==='string'?p.licenceClass.trim().slice(0,50):'';if(plate.length<2||!/^[A-Z0-9][A-Z0-9 -]{0,18}[A-Z0-9]$/.test(plate))throw Error('Enter a valid vehicle number plate (2–20 letters, numbers, spaces or hyphens).');driver.publicProfile={name,description,vehicle,plate,vehicleColour,serviceArea,licenceClass,updatedAt:now};driver.name=name;driver.serviceArea=serviceArea;return true;}
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
