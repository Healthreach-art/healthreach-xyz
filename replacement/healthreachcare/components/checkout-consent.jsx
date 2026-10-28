'use client';
export function CheckoutConsent({s,act,busy,provider=false,homecare=false}){
 if(!s.realAccount)return null;
 const ids=homecare?['privacy']:['terms','privacy',...(provider?['provider']:[])],pending=(s.legalDocuments||[]).filter(d=>ids.includes(d.id)&&!(s.acceptances||[]).some(a=>a.documentId===d.id&&a.version===d.version&&a.accepted));
 if(!pending.length)return null;
 if(homecare){const doc=pending[0];return <section className="checkout-consent"><h3>Privacy notice</h3><p>Review the privacy notice once for your account. Your acceptance is saved for this policy version.</p><details><summary>{doc.title}</summary><p>{doc.body||doc.text}</p></details><button type="button" disabled={busy} onClick={()=>act('acceptLegal',{documentId:doc.id,version:doc.version,accepted:true},'Privacy notice acknowledged')}>Acknowledge privacy notice</button></section>;}
 return <section className="checkout-consent"><h3>Policies for your account</h3><p>Review once. Your acceptance is saved for this policy version across your account. Optional location and marketing choices stay separate.</p>{(s.legalDocuments||[]).filter(d=>!['location','marketing'].includes(d.id)&&(provider||d.id!=='provider')).map(d=><details key={d.id}><summary>{d.title}</summary><p>{d.body||d.text}</p></details>)}<button type="button" disabled={busy} onClick={()=>act('acceptPolicyBundle',{version:'2026-10-connected-1',accepted:true},'Policies accepted for your account')}>Accept policies & continue</button></section>;
}
