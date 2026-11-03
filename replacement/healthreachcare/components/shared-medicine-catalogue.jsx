'use client';
import {useState} from 'react';
import {productKey} from '../lib/matching.mjs';

const money=value=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(value);

export function SharedMedicineCatalogue({s,act,busy}){
 const catalogue=new Map((s.medicineCatalogue||[]).map(item=>[item.productKey,item]));
 const keys=new Set([...catalogue.keys(),...(s.products||[]).filter(p=>!p.removed).map(productKey)]);
 const [prices,setPrices]=useState({});
 const rows=[...keys].map(key=>{const item=catalogue.get(key),branches=(s.products||[]).filter(p=>!p.removed&&productKey(p)===key);return item||{productKey:key,name:branches[0]?.name||'Medicine',strength:branches[0]?.strength||'',form:branches[0]?.form||'',packageSize:branches[0]?.packageSize||'',category:branches[0]?.category||'Other',status:'Needs review',branchCount:branches.length,suggestedMin:null,suggestedMax:null};}).sort((a,b)=>a.name.localeCompare(b.name));
 return <section className="section shared-medicine-catalogue"><div className="section-title"><div><h2>HealthReachCare medicine prices</h2><p>Set one app price per medicine and pack. That price is shared across pharmacy branches.</p></div></div>
  {!rows.length&&<div className="panel padded"><h3>No pharmacy submissions yet</h3><p>When pharmacies add a medicine, it will appear here for a shared price decision.</p></div>}
  <div className="shared-medicine-list">{rows.map(item=><article className="panel padded shared-medicine-row" key={item.productKey}>
   <div><strong>{item.name} {[item.strength,item.form,item.packageSize].filter(Boolean).join(' · ')}</strong><small>{item.branchCount} pharmacy {item.branchCount===1?'branch':'branches'} · {item.category}</small>{item.status==='Published'?<span className="badge">Shared app price · {money(item.price)}</span>:<span className="badge">Needs shared price</span>}{item.suggestedMin!==null&&item.suggestedMax!==null&&<small>Pharmacy proposals: {money(item.suggestedMin)}–{money(item.suggestedMax)} · review before setting</small>}</div>
   <form className="shared-medicine-price-form" onSubmit={async e=>{e.preventDefault();const value=prices[item.productKey]??(item.status==='Published'?String(item.price):'');if(!value)return;if(await act('setMedicinePrice',{productKey:item.productKey,price:Number(value)},'Shared HealthReachCare price saved'))setPrices(current=>({...current,[item.productKey]:''}));}}>
    <label>Patient price (R)<input type="number" min="0.01" max="1000000" step="0.01" required value={prices[item.productKey]??(item.status==='Published'?String(item.price):'')} onChange={e=>setPrices(current=>({...current,[item.productKey]:e.target.value}))}/></label><button disabled={busy}>{item.status==='Published'?'Update shared price':'Set shared price & publish'}</button>
   </form>
  </article>)}</div>
  <p className="muted">Changing this price affects new baskets at every branch. Saved orders keep their original price snapshot. Pharmacy proposals remain hidden from patients until a shared price is approved.</p>
 </section>;
}
