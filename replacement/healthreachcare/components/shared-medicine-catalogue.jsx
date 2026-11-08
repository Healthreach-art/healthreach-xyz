'use client';
import {useState} from 'react';
import {productKey} from '../lib/matching.mjs';

const money=value=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(value);
const initial=item=>({
 priceModel:item?.priceModel==='SEP'?'SEP':item?.priceModel==='branch'?'branch':'shared',
 price:item?.price??(item?.suggestedMin!=null&&item.suggestedMin===item.suggestedMax?item.suggestedMin:''),schedule:item?.schedule||'',registeredProductId:item?.registeredProductId||'',
 activeIngredient:item?.activeIngredient||'',brand:item?.brand||'',
 officialSource:item?.officialSource||'https://www.health.gov.za/nhi-pee/',
 priceDataDate:item?.priceDataDate||''
});
export function SharedMedicineCatalogue({s,act,busy}){
 const catalogue=new Map((s.medicineCatalogue||[]).map(item=>[item.productKey,item]));
 const keys=new Set([...catalogue.keys(),...(s.products||[]).filter(p=>!p.removed).map(productKey)]);
 const [forms,setForms]=useState({});
 const rows=[...keys].map(key=>{
  const item=catalogue.get(key),branches=(s.products||[]).filter(p=>!p.removed&&productKey(p)===key);
  return item||{productKey:key,name:branches[0]?.name||'Medicine',strength:branches[0]?.strength||'',form:branches[0]?.form||'',packageSize:branches[0]?.packageSize||'',category:branches[0]?.category||'Other',status:'Needs review',branchCount:branches.length,suggestedMin:null,suggestedMax:null};
 }).sort((a,b)=>a.name.localeCompare(b.name));
 function set(key,patch){setForms(v=>({...v,[key]:{...initial(rows.find(r=>r.productKey===key)),...v[key],...patch}}));}
 return <section className="section shared-medicine-catalogue">
  <div className="section-title"><div><h2>Shared medicine catalogue</h2><p>Review a product once. Publishing updates its pharmacy stock record and the Patient medication catalogue together, provided an approved pharmacy has active stock.</p></div></div>
  {!rows.length&&<div className="panel padded"><h3>No pharmacy submissions yet</h3><p>When pharmacies add products, they appear here for catalogue review.</p></div>}
  <div className="shared-medicine-list">{rows.map(item=>{
   const form={...initial(item),...forms[item.productKey]},branchPrice=form.priceModel==='branch',sep=form.priceModel==='SEP';
   return <article className="panel padded shared-medicine-row" key={item.productKey}>
    <div><strong>{item.name} {[item.strength,item.form,item.packageSize].filter(Boolean).join(' · ')}</strong><small>{item.branchCount} pharmacy {item.branchCount===1?'branch':'branches'} · {item.category}</small>
     {item.status==='Published'?<span className="badge">{sep?'Official SEP reference':branchPrice?'Branch prices':'Shared price'}{item.price!=null?' · '+money(item.price):''}</span>:<span className="badge">Needs review</span>}
     {item.suggestedMin!==null&&item.suggestedMax!==null&&<small>Pharmacy suggestions: {money(item.suggestedMin)}–{money(item.suggestedMax)}</small>}
     <p role="status" className={item.status==='Published'?'catalogue-publish-status is-published':'catalogue-publish-status'}>{item.status==='Published'?'Published — the approved price is shared with pharmacy stock and Patient medication listings when this branch is active and in stock.':'Needs review — patients cannot see this product until you complete and save this review.'}</p>
    </div>
    <form className="shared-medicine-price-form" onSubmit={async e=>{
      e.preventDefault();
      const value=forms[item.productKey]||initial(item);
      const payload={productKey:item.productKey,priceModel:value.priceModel,price:value.price===''?undefined:Number(value.price),schedule:value.schedule,registeredProductId:value.registeredProductId,activeIngredient:value.activeIngredient,brand:value.brand,officialSource:value.officialSource,priceDataDate:value.priceDataDate};
      if(await act('setMedicinePrice',payload,'Shared medicine record saved'))setForms(current=>({...current,[item.productKey]:undefined}));
    }}>
     <label>Pricing category<select value={form.priceModel} onChange={e=>set(item.productKey,{priceModel:e.target.value})}><option value="SEP">SEP-regulated medicine</option><option value="branch">Pharmacy-priced category (reviewed)</option><option value="shared">Shared catalogue price</option></select></label>
     {sep&&<p className="muted">SEP publication needs the real registered product ID, schedule, current official SEP, official source URL and price-data date. A pharmacy suggestion is not a verified SEP.</p>}
     {sep&&<><label>Current SEP (R)<input type="number" min="0.01" max="1000000" step="0.01" required value={form.price} onChange={e=>set(item.productKey,{price:e.target.value})}/></label><label>Registered product ID<input required maxLength="100" value={form.registeredProductId} onChange={e=>set(item.productKey,{registeredProductId:e.target.value})}/></label><label>Schedule<input required maxLength="20" value={form.schedule} onChange={e=>set(item.productKey,{schedule:e.target.value})}/></label><label>Official Department of Health source URL<input required type="url" value={form.officialSource} onChange={e=>set(item.productKey,{officialSource:e.target.value})}/></label><label>Price data date<input required type="date" value={form.priceDataDate} onChange={e=>set(item.productKey,{priceDataDate:e.target.value})}/></label></>}
     {branchPrice&&<><p>Use for reviewed categories where branch-specific pricing rules apply, such as Schedule 0 or complementary products. Each pharmacy keeps its own price.</p><label>Schedule / category<input maxLength="20" value={form.schedule} onChange={e=>set(item.productKey,{schedule:e.target.value})}/></label></>}
     {!branchPrice&&!sep&&<><label>Shared medicine price (R)<input type="number" min="0.01" max="1000000" step="0.01" required value={form.price} onChange={e=>set(item.productKey,{price:e.target.value})}/></label><small>Confirm the verified shared price before publishing. A single pharmacy suggestion is prefilled for review.</small></>}
     <label>Active ingredient<input maxLength="160" value={form.activeIngredient} onChange={e=>set(item.productKey,{activeIngredient:e.target.value})}/></label><label>Brand or generic name<input maxLength="100" value={form.brand} onChange={e=>set(item.productKey,{brand:e.target.value})}/></label>
     <button disabled={busy}>{item.status==='Published'?'Save catalogue changes':'Publish in Pharmacy & Patient catalogue'}</button>
    </form>
   </article>;
  })}</div>
  <p className="muted">SEP medicines use one centrally reviewed price for the same pack. Other reviewed categories can use each branch’s saved price. Branch stock and opening hours stay separate. Confirmed orders keep their saved price and fee breakdown.</p>
 </section>;
}
