'use client';
export function CheckoutConsent({s,act,busy,provider=false}){
 if(!s.realAccount)return null;
 const ids=['terms','privacy',...(provider?['provider']:[])],pending=(s.legalDocuments||[]).filter(d=>ids.includes(d.id)&&!(s.acceptances||[]).some(a=>a.documentId===d.id&&a.version===d.version&&a.accepted));
 if(!pending.length)return null;
 return <section className="checkout-consent"><h3>Policies for your account</h3><p>Review once. Your acceptance is saved for this policy version across your account. Optional location and marketing choices stay separate.</p>{(s.legalDocuments||[]).filter(d=>!['location','marketing'].includes(d.id)&&(provider||d.id!=='provider')).map(d=><details key={d.id}><summary>{d.title}</summary><p>{d.body||d.text}</p></details>)}<button type="button" disabled={busy} onClick={()=>act('acceptPolicyBundle',{version:'2026-10-connected-1',accepted:true},'Policies accepted for your account')}>Accept policies & continue</button></section>;
}
