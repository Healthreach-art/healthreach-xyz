'use client';
import Image from 'next/image';
import {Pill,Plus,MapPin,Clock,Navigation,ChevronDown,Info} from 'lucide-react';
import {dayNames} from '../lib/provider-hours.mjs';
import {medicineFeeBreakdown} from '../lib/medicine-pricing.mjs';
const money=v=>'R '+Number(v||0).toFixed(2);
function todaySchedule(provider){
 const weekday=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Johannesburg',weekday:'long'}).format(new Date());
 const day=dayNames.indexOf(weekday),hours=provider?.weeklyHours?.find(v=>v.day===day);
 if(!hours)return provider?.openTime&&provider?.closeTime?provider.openTime+'–'+provider.closeTime:'Hours not published';
 if(hours.closed)return 'Closed today';if(hours.allDay)return 'Open 24 hours';return hours.open+'–'+hours.close;
}
const orderTotal=(branch,product,pricing)=>medicineFeeBreakdown([{medicinePrice:Number(branch?.price??product?.price??0),quantity:1,dispensingFee:Number(branch?.dispensingFee||0),dispensingVat:Number(branch?.dispensingVat||0)}],Number(branch?.deliveryFee||0),pricing).totalMinor/100;
export function NearbyPharmacyCatalogue({products,providers,cart,onAdd,onDetail,onAddress,address,pricing}){
 const canonical=products.filter(product=>product.active&&!product.removed);
 const branchesFor=product=>product.branches?.length?product.branches:providers.filter(provider=>provider.id===product.ownerId).map(provider=>({...provider,stockAvailable:product.stock>0,price:product.price,deliveryFee:provider.deliveryFee??provider.fee}));
 const bestBranch=product=>[...branchesFor(product)].sort((a,b)=>Number(b.stockAvailable&&b.priceValid!==false&&b.openNow)-Number(a.stockAvailable&&a.priceValid!==false&&a.openNow)||Number(b.stockAvailable&&b.priceValid!==false)-Number(a.stockAvailable&&a.priceValid!==false)||(a.distanceKm??Infinity)-(b.distanceKm??Infinity)||String(a.id).localeCompare(String(b.id)))[0];
 return <section className="nearby-catalogue">
  <div className="address-summary"><MapPin size={18}/><span>{address?.formatted||'Add a delivery address to see the closest pharmacy'}</span><button className="text-button" onClick={onAddress}>{address?'Change address':'Add address'}</button></div>
  <div className="medicine-card-grid">{canonical.map(product=>{
   const branchRows=branchesFor(product),pharmacy=bestBranch(product),isOpen=pharmacy?.openNow===true,available=branchRows.some(branch=>branch.stockAvailable&&branch.priceValid!==false),hours=todaySchedule(pharmacy),km=pharmacy?.distanceKm;
   const detail=()=>onDetail({...product,detailBranch:pharmacy});
   return <article className="nearby-medicine-card" key={product.productKey||product.id}>
    <button className="nearby-medicine-image" onClick={detail} aria-label={'View '+product.name+' details'}>{product.image?<Image unoptimized src={product.image} width={120} height={120} alt={product.name}/>:<Pill size={34}/>}</button>
    <div className="nearby-medicine-content">
     <div className="nearby-medicine-copy"><small>{product.category}{product.schedule?' · Schedule '+product.schedule:''}</small><button className="nearby-medicine-name" onClick={detail}>{product.name}</button><span>{[product.strength,product.form,product.packageSize].filter(Boolean).join(' · ')||'Medicine details'}</span></div>
     {(()=>{const unit=Number(pharmacy?.price??product.price),dispensingFee=Number(pharmacy?.dispensingFee||0),dispensingVat=Number(pharmacy?.dispensingVat||0),deliveryConfigured=Number.isFinite(Number(pharmacy?.deliveryFee)),deliveryFee=deliveryConfigured?Number(pharmacy.deliveryFee):0,charges=medicineFeeBreakdown([{medicinePrice:unit,quantity:1,dispensingFee,dispensingVat}],deliveryFee,pricing),platformFee=charges.platformFeeMinor/100,vat=charges.platformVatMinor/100,total=charges.totalMinor/100;return <div className="nearby-card-price"><strong className="nearby-medicine-price">{money(total)}</strong><small>Medicine {money(unit)} + platform {money(platformFee)}{vat>0?' + VAT '+money(vat):''}{dispensingFee>0?' + dispensing '+money(dispensingFee+dispensingVat):''}{deliveryConfigured?' + delivery '+money(deliveryFee):' · delivery shown at checkout'}</small></div>;})()}
     <div className="nearby-medicine-meta"><span><MapPin size={14}/>{pharmacy?.name||'HealthReachCare pharmacy'}{pharmacy?.location?' · '+pharmacy.location:''}</span><span><Clock size={14}/>{isOpen?'Open now':'Hours'} · {hours}</span><span><Navigation size={14}/>{Number.isFinite(km)?km.toFixed(1)+' km away':'Distance unavailable'}</span></div>
     <div className="nearby-medicine-actions"><button className="outline nearby-detail-button" onClick={detail}><Info size={15}/>Details</button><button disabled={!available} onClick={()=>onAdd(product)}><Plus size={15}/>{cart[product.id]?'Add another ('+cart[product.id]+')':'Add'}</button></div>
     {!available&&<small className="nearby-stock-note">Currently unavailable</small>}
     {branchRows.length>1&&<details className="branch-comparison"><summary><ChevronDown size={15}/> Compare {branchRows.length} pharmacies</summary>{branchRows.map(branch=><div className="branch-option" key={branch.id}><b>{branch.name}</b><span>{branch.openNow?'Open now':'Closed'} · {branch.stockAvailable&&branch.priceValid!==false?'In stock':'Unavailable'}</span><span>{Number.isFinite(branch.distanceKm)?branch.distanceKm.toFixed(1)+' km':'Distance unavailable'} · {todaySchedule(branch)}</span><strong>{money(orderTotal(branch,product,pricing))} estimated total with delivery</strong></div>)}</details>}
    </div>
   </article>;
  })}</div>
  {!canonical.length&&<div className="panel padded"><h3>No medicines available right now</h3><p>Approved medicines appear here when a participating pharmacy has active stock.</p></div>}
 </section>;
}
