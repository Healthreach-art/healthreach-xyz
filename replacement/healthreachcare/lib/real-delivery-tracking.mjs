import {validMapPoint} from './map-location.mjs';
const terminal=r=>!r||['Delivered','Collected','Completed','Cancelled','Declined','Rejected'].includes(r.status);
export function maintainRealTracking(s,now=Date.now()){
 for(const [id,point] of Object.entries(s.deliveryLocations||{})){const task=s.deliveryTasks.find(t=>t.id===id),record=s.records.find(r=>r.id===task?.recordId);if(point.source==='firebase'&&(!task||terminal(record)||task.driverId!==point.driverId||point.expires<=now||s.drivers[point.driverId]?.status!=='Approved')){if(task)task.lastLocationAt=point.at;delete s.deliveryLocations[id];}}
}
export function handleRealTracking(c){
 const {s,session,action,p,now}=c;
 if(action==='deliveryOperations'){
  if(session.role!=='Admin')throw Error('Only an authorized administrator can view delivery operations.');
  if(typeof p.purpose!=='string'||!p.purpose.trim()||p.purpose.length>300)throw Error('Enter the operational reason for viewing delivery locations.');
  maintainRealTracking(s,Date.parse(now));
  c.extra.deliveryOperations=s.deliveryTasks.filter(t=>t.driverId&&s.drivers[t.driverId]?.status==='Approved'&&['Assigned','Arrived at pickup','Collected','En route','Arrived at destination'].includes(t.status)).flatMap(t=>{
   const r=s.records.find(r=>r.id===t.recordId);if(terminal(r)||r.payment!=='Paid'||r.isOrder!==true||r.type==='Prescription'&&(!r.prescriptionApproved||r.requiresDocuments&&r.identity?.status!=='Verified'))return [];
   const provider=s.providers.find(v=>v.id===r.providerId),point=s.deliveryLocations?.[t.id];
   return [{taskId:t.id,reference:'HRC-'+r.id.slice(0,8),status:t.status,driver:s.drivers[t.driverId].name,pickup:{label:provider?.location||provider?.name||'',coordinates:validMapPoint(provider?.coordinates)?provider.coordinates:null},destination:{label:r.address||'',coordinates:validMapPoint(r.addressDetails)?{latitude:r.addressDetails.latitude,longitude:r.addressDetails.longitude}:null},tracking:point?.source==='firebase'&&point.driverId===t.driverId&&point.consented&&point.expires>Date.parse(now)&&validMapPoint(point)?{at:point.at,latitude:point.latitude,longitude:point.longitude}:null}];
  });
  c.extra.deliveryOperationsUpdatedAt=now;
  s.audit.push({id:crypto.randomUUID(),action:'delivery-location-access',actorId:session.accountId,at:now,purpose:p.purpose.trim(),count:c.extra.deliveryOperations.length});return true;
 }
 if(!['shareDriverLocation','stopDriverLocation','saveDeliveryEta'].includes(action))return false;
 if(session.role!=='Driver'||s.drivers[session.accountId]?.status!=='Approved')throw Error('Only an approved driver can update delivery tracking.');
 if(action==='stopDriverLocation'){for(const [id,point] of Object.entries(s.deliveryLocations||{}))if(point.driverId===session.accountId){const task=s.deliveryTasks.find(t=>t.id===id);if(task)task.lastLocationAt=point.at;delete s.deliveryLocations[id];}return true;}
 const task=s.deliveryTasks.find(t=>t.id===p.taskId&&t.driverId===session.accountId),record=s.records.find(r=>r.id===task?.recordId);
 if(!task||terminal(record)||record.payment!=='Paid'||record.isOrder!==true||!['Assigned','Arrived at pickup','Collected','En route','Arrived at destination'].includes(task.status)||record.type==='Prescription'&&(!record.prescriptionApproved||record.requiresDocuments&&record.identity?.status!=='Verified'))throw Error('This delivery is not eligible for location or arrival updates.');
 if(action==='saveDeliveryEta'){if(!Number.isInteger(p.minutes)||p.minutes<1||p.minutes>240)throw Error('Enter an arrival estimate between 1 and 240 minutes.');task.estimatedDeliveryAt=new Date(Date.parse(now)+p.minutes*60000).toISOString();task.etaUpdatedAt=now;task.etaSource='Assigned driver';return true;}
 if(p.consent!==true||!validMapPoint(p)||!Number.isFinite(p.accuracy)||p.accuracy<0||p.accuracy>10000)throw Error('Valid device coordinates, accuracy and explicit location permission are required.');
 s.deliveryLocations??={};s.deliveryLocations[task.id]={latitude:p.latitude,longitude:p.longitude,accuracy:p.accuracy,at:now,expires:Date.parse(now)+120000,driverId:session.accountId,taskId:task.id,source:'firebase',consented:true};task.lastLocationAt=now;return true;
}
