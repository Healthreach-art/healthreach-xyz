import {validMapPoint} from './map-location.mjs';
export function deliveryProgress(record,task,tracking,now=Date.now()){
 if(!record||!['Order','Prescription'].includes(record.type))return null;
 const collection=record.fulfilment==='Collection',ended=['Delivered','Collected','Completed','Cancelled','Declined','Rejected'].includes(record.status);
 const steps=collection?['Order','Preparing','Ready','Collected']:['Order','Preparing','Driver assigned','On the way','Delivered'];
 let index=0;if(['Accepted','Processing','Prepared','Ready for collection','Ready for dispatch'].includes(record.status))index=1;
 if(!collection&&task?.driverId)index=2;
 if(!collection&&['Collected','En route','Arrived at destination'].includes(task?.status))index=3;
 if(record.status==='Ready for collection'&&collection)index=2;
 if(record.status===(collection?'Collected':'Delivered'))index=steps.length-1;
 const blocked=['Cancelled','Declined','Rejected'].includes(record.status)?'This order has ended.':record.payment!=='Paid'?'Payment is pending. Delivery cannot start.':record.type==='Prescription'&&(!record.prescriptionApproved||record.requiresDocuments&&record.identity?.status!=='Verified')?'Pharmacy prescription and identity checks must be completed before fulfilment.':null;
 if(blocked)index=0;
 const eta=Date.parse(task?.estimatedDeliveryAt||''),hasEstimate=!ended&&!blocked&&task?.driverId&&Number.isFinite(eta);
 const arrival=ended?(record.status==='Delivered'?'Delivered':record.status==='Collected'?'Collected':'Order ended'):hasEstimate?(eta>now?'Estimated arrival '+new Date(eta).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'})+' · about '+Math.ceil((eta-now)/60000)+' min':'Arrival estimate needs an update'):'Arrival estimate not yet confirmed';
 const age=now-Date.parse(tracking?.lastUpdate||'');const point=!ended&&!blocked&&task?.driverId&&tracking?.state==='Live'&&age>=-15000&&age<=120000&&validMapPoint(tracking.location)?tracking.location:null;
 return {steps,index,collection,ended,blocked,arrival,point};
}
