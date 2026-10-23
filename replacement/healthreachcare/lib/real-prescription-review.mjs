export function handleRealPrescriptionReview(c){
 const {s,session,p,action,now,event}=c;if(!['prescriptionReview','clarification'].includes(action))return false;
 const record=s.records.find(r=>r.id===p.id&&r.type==='Prescription');
 if(!record||record.payment==='Paid')throw Error('This prescription is not available for unpaid review.');
 const reason=typeof p.note==='string'?p.note.trim().slice(0,300):'';
 if(action==='clarification'){
  if(session.role!=='Patient'||record.patientId!==session.accountId||record.status!=='Clarification requested')throw Error('No prescription clarification is pending for your account.');
  if(['prescription','id-front','id-back','selfie'].some(kind=>!s.documents.some(d=>d.kind===kind&&(d.recordId===record.id||d.recordIds?.includes(record.id))&&!d.purged&&d.retainUntil>Date.now())))throw Error('Attach the required documents before returning this order to review.');
  record.prescriptionApproved=false;event(record,'Under review','Updated prescription documents returned for review.');return true;
 }
 if(session.role!=='Pharmacy'||record.providerId!==session.accountId||!['Under review','Clarification requested','Prescription approved'].includes(record.status))throw Error('This prescription is not awaiting your pharmacy review.');
 if(!reason)throw Error('Enter the pharmacy review reason.');
 if(p.decision==='Reject'){record.prescriptionApproved=false;record.verification={at:now,by:session.name,reviewerId:session.accountId,reason,outcome:'Rejected'};event(record,'Rejected',reason);return true;}
 if(p.decision==='Clarify'){record.prescriptionApproved=false;event(record,'Clarification requested',reason);return true;}
 if(p.decision!=='Approve'||p.verified!==true||record.identity?.status!=='Verified')throw Error('Verify the prescription and identity evidence before approval.');
 if(!Array.isArray(p.items)||!p.items.length||p.items.length>50||new Set(p.items.map(i=>i.id)).size!==p.items.length)throw Error('Choose verified medication products and quantities.');
 const lines=p.items.map(line=>{const product=s.products.find(v=>v.id===line.id&&v.ownerId===session.accountId&&v.active&&!v.removed);if(!product||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>product.stock||!Number.isFinite(product.price)||product.price<0)throw Error('Choose available pharmacy products with valid prices and quantities.');return {id:product.id,name:product.name,price:product.price,quantity:line.quantity,requiresPrescription:product.requiresPrescription===true};});
 const fee=record.deliveryFee;if(!Number.isFinite(fee)||fee<0)throw Error('The saved fulfilment fee needs pharmacy review.');
 record.items=lines;record.total=Math.round((lines.reduce((total,line)=>total+line.price*line.quantity,0)+fee)*100)/100;record.prescriptionApproved=true;record.isOrder=false;record.verification={at:now,by:session.name,reviewerId:session.accountId,reason,documentIds:s.documents.filter(d=>(d.recordId===record.id||d.recordIds?.includes(record.id))&&!d.purged&&d.retainUntil>Date.now()).map(d=>d.id)};record.details=lines.map(i=>i.name+' × '+i.quantity).join(', ');event(record,'Prescription approved','Verified products and fixed total ready for payment.');return true;
}
