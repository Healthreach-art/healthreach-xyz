'use client';
export function CheckoutConsent({s,act,busy,provider=false}){
 if(!s.realAccount)return null;
 const ids=['terms','privacy',...(provider?['provider']:[])],pending=(s.legalDocuments||[]).filter(d=>ids.includes(d.id)&&!(s.acceptances||[]).some(a=>a.documentId===d.id&&a.version===d.version&&a.accepted));
 if(!pending.length)return null;
 return <section className="checkout-consent"><h3>Before continuing</h3><p>Read and acknowledge the current policies. Your choices are saved against your signed-in account.</p>{pending.map(d=><div key={d.id}><details><summary>{d.title} · {d.version}</summary><p style={{whiteSpace:'pre-line'}}>{d.body||d.text||d.summary||'Open Account → Legal & privacy for the full policy.'}</p></details><button type="button" className="outline" disabled={busy} onClick={()=>act('acceptLegal',{documentId:d.id,version:d.version,accepted:true},d.title+' acknowledgement saved')}>I acknowledge {d.title}</button></div>)}</section>;
}
