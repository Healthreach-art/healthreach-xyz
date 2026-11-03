'use client';
import Image from 'next/image';
import {Pill,Plus,MapPin,Clock,Navigation} from 'lucide-react';
import {dayNames} from '../lib/provider-hours.mjs';
const money=v=>'R '+Number(v).toFixed(2);
function todaySchedule(provider){
 const weekday=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',weekday:'long'}).format(new Date());
 const day=dayNames.indexOf(weekday),hours=provider?.weeklyHours?.find(v=>v.day===day);
 if(!hours)return provider?.openTime&&provider?.closeTime?`${provider.openTime}–${provider.closeTime}`:'Hours not published';
 if(hours.closed)return 'Closed today';
 if(hours.allDay)return 'Open 24 hours';
 return `${hours.open}–${hours.close}`;
}
export function NearbyPharmacyCatalogue({products,providers,cart,onAdd,onDetail,onAddress,address}){
 const canonical=products.filter(product=>product.active&&!product.removed);
 const branchesFor=product=>product.branches?.length?product.branches:providers.filter(provider=>provider.id===product.ownerId).map(provider=>({...provider,stockAvailable:product.stock>0}));
 const bestBranch=product=>[...branchesFor(product)].sort((a,b)=>Number(b.stockAvailable&&b.openNow)-Number(a.stockAvailable&&a.openNow)||Number(b.stockAvailable)-Number(a.stockAvailable)||(a.distanceKm??Infinity)-(b.distanceKm??Infinity)||String(a.id).localeCompare(String(b.id)))[0];
 return <section className="nearby-catalogue">
  <div className="address-summary"><MapPin size={18}/><span>{address?.formatted||'Add a delivery address to see the closest pharmacy'}</span><button className="text-button" onClick={onAddress}>{address?'Change address':'Add address'}</button></div>
  <p>HealthReachCare is one online pharmacy with local partner branches. Each medicine has one shared price. We route the order to the nearest open branch that has the full basket; if it cannot fulfil it, we check the next closest branch.</p>
  <div className="product-grid">{canonical.map(product=>{
   const pharmacy=bestBranch(product),isOpen=pharmacy?.openNow===true,available=branchesFor(product).some(branch=>branch.stockAvailable),hours=todaySchedule(pharmacy),km=pharmacy?.distanceKm;
   return <article className="product-card" key={product.productKey||product.id}>
    <button className="product-art" onClick={()=>onDetail(product)}>{product.image?<Image unoptimized src={product.image} width={300} height={180} alt={product.name}/>:<Pill size={64}/>}</button>
    <div className="product-body"><small>{product.category}</small><h3>{product.name}</h3><p>{[product.strength,product.form,product.packageSize].filter(Boolean).join(' · ')}</p>
     <p>{product.description}</p>{product.requiresPrescription&&<span className="badge">Prescription review required</span>}
     {pharmacy&&<div className="pharmacy-branch-summary"><strong>{pharmacy.name||'HealthReachCare pharmacy'}</strong><span><MapPin size={14}/>{pharmacy.location||'Branch address not published'}</span><span><Clock size={14}/>{isOpen?'Open now · ':'Closed now · '}{hours}</span><span><Navigation size={14}/>{Number.isFinite(km)?`${km.toFixed(1)} km from your delivery address · straight-line estimate`:'Distance appears when both locations have coordinates'}</span></div>}
     <span className="stock">{available?(isOpen?'Available at a nearby branch':'In stock at a branch · order when a nearby branch is open'):'Currently out of stock at listed branches'}</span>
     <div className="product-bottom"><strong>{money(product.price)}</strong><button disabled={!available} onClick={()=>onAdd(product)}><Plus size={16}/>Add {cart[product.id]?`(${cart[product.id]})`:''}</button></div>
     {product.requiresPrescription&&<small>Prescription checks are completed by the selected pharmacy before fulfilment.</small>}
    </div>
   </article>;
  })}</div>
  {!canonical.length&&<div className="panel padded"><h3>No medicines available right now</h3><p>Approved pharmacies add stock to the shared HealthReachCare catalogue. Try again later or contact support.</p></div>}
 </section>;
}
