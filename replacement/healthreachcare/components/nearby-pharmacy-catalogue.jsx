'use client';
import Image from 'next/image';
import {Pill,Plus,MapPin,Clock,Navigation,ChevronDown} from 'lucide-react';
import {dayNames} from '../lib/provider-hours.mjs';
const money=v=>'R '+Number(v||0).toFixed(2);
function todaySchedule(provider){
 const weekday=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',weekday:'long'}).format(new Date());
 const day=dayNames.indexOf(weekday),hours=provider?.weeklyHours?.find(v=>v.day===day);
 if(!hours)return provider?.openTime&&provider?.closeTime?provider.openTime+'–'+provider.closeTime:'Hours not published';
 if(hours.closed)return 'Closed today';if(hours.allDay)return 'Open 24 hours';return hours.open+'–'+hours.close;
}
const orderTotal=branch=>Number(branch?.price||0)+Number(branch?.dispensingFee||0)+Number(branch?.dispensingVat||0)+Number(branch?.deliveryFee||0);
export function NearbyPharmacyCatalogue({products,providers,cart,onAdd,onDetail,onAddress,address}){
 const canonical=products.filter(product=>product.active&&!product.removed);
 const branchesFor=product=>product.branches?.length?product.branches:providers.filter(provider=>provider.id===product.ownerId).map(provider=>({...provider,stockAvailable:product.stock>0,price:product.price,deliveryFee:provider.deliveryFee??provider.fee}));
 const bestBranch=product=>[...branchesFor(product)].sort((a,b)=>Number(b.stockAvailable&&b.priceValid!==false&&b.openNow)-Number(a.stockAvailable&&a.priceValid!==false&&a.openNow)||Number(b.stockAvailable&&b.priceValid!==false)-Number(a.stockAvailable&&a.priceValid!==false)||(a.distanceKm??Infinity)-(b.distanceKm??Infinity)||String(a.id).localeCompare(String(b.id)))[0];
 return <section className="nearby-catalogue">
  <div className="address-summary"><MapPin size={18}/><span>{address?.formatted||'Add a delivery address to see the closest pharmacy'}</span><button className="text-button" onClick={onAddress}>{address?'Change address':'Add address'}</button></div>
  <p>One HealthReachCare catalogue with local pharmacy branches. Choose verified products, compare nearby availability and review all charges before checkout.</p>
  <div className="product-grid">{canonical.map(product=>{
   const branchRows=branchesFor(product),pharmacy=bestBranch(product),isOpen=pharmacy?.openNow===true,available=branchRows.some(branch=>branch.stockAvailable&&branch.priceValid!==false),hours=todaySchedule(pharmacy),km=pharmacy?.distanceKm;
   return <article className="product-card" key={product.productKey||product.id}>
    <button className="product-art" onClick={()=>onDetail(product)}>{product.image?<Image unoptimized src={product.image} width={300} height={180} alt={product.name}/>:<Pill size={64}/>}</button>
    <div className="product-body"><small>{product.category}{product.schedule?' · Schedule '+product.schedule:''}</small><h3>{product.name}</h3><p>{[product.brand,product.activeIngredient,product.strength,product.form,product.packageSize].filter(Boolean).join(' · ')}</p><p>{product.description}</p>{product.requiresPrescription&&<span className="badge">Prescription review required</span>}
     {pharmacy&&<div className="pharmacy-branch-summary"><strong>{pharmacy.name||'HealthReachCare pharmacy'}</strong><span><MapPin size={14}/>{pharmacy.location||'Branch address not published'}</span><span><Clock size={14}/>{isOpen?'Open now · ':'Closed now · '}{hours}</span><span><Navigation size={14}/>{Number.isFinite(km)?km.toFixed(1)+' km from your delivery address · straight-line estimate':'Distance appears when both locations have coordinates'}</span><div className="price-breakdown"><span>Medicine {product.priceModel==='SEP'?'(SEP)':'price'} <b>{money(pharmacy.price??product.price)}</b></span>{Number(pharmacy.dispensingFee)>0&&<span>Dispensing fee <b>{money(pharmacy.dispensingFee)}{pharmacy.vatRegistered?' + VAT '+money(pharmacy.dispensingVat):''}</b></span>}<span>Delivery fee <b>{money(pharmacy.deliveryFee)}</b></span><strong>Estimated total <b>{money(orderTotal(pharmacy))}</b></strong></div></div>}
     <span className="stock">{available?(isOpen?'Available at a nearby branch':'In stock at a branch · orders routed when a branch is open'):'No eligible branch is available for the selected delivery area or the saved pharmacy charges need review'}</span>
     <div className="product-bottom"><strong>{money(pharmacy?.price??product.price)}</strong><button disabled={!available} onClick={()=>onAdd(product)}><Plus size={16}/>Add {cart[product.id]?'('+cart[product.id]+')':''}</button></div>
     {branchRows.length>1&&<details className="branch-comparison"><summary><ChevronDown size={15}/> Compare {branchRows.length} pharmacies</summary>{branchRows.map(branch=><div className="branch-option" key={branch.id}><b>{branch.name}</b><span>{branch.openNow?'Open now':'Closed'} · {branch.stockAvailable&&branch.priceValid!==false?'In stock':'Unavailable'}</span><span>{Number.isFinite(branch.distanceKm)?branch.distanceKm.toFixed(1)+' km':'Distance unavailable'} · {todaySchedule(branch)}</span><span>Medicine {money(branch.price??product.price)} · dispensing {money(branch.dispensingFee)} · delivery {money(branch.deliveryFee)}</span><strong>Estimated total {money(orderTotal(branch))}</strong>{branch.priceValid===false&&<em>Pharmacy fee configuration needs review</em>}</div>)}</details>}
     {product.requiresPrescription&&<small>The selected pharmacy reviews the prescription before fulfilment. No product is substituted without your choice.</small>}
    </div>
   </article>;
  })}</div>
  {!canonical.length&&<div className="panel padded"><h3>No medicines available right now</h3><p>Approved pharmacies publish products after shared catalogue review. Check back later or contact support.</p></div>}
 </section>;
}
