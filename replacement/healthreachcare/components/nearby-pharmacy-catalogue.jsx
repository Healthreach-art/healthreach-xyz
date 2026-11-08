'use client';
import Image from 'next/image';
import {Pill,Plus,Clock,Navigation,Info} from 'lucide-react';
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
function travelLabel(branch){
 const km=Number(branch?.distanceKm);if(!Number.isFinite(km))return 'Distance unavailable';
 const routeMinutes=Number(branch?.travelMinutes??branch?.etaMinutes??branch?.estimatedTravelMinutes);
 return Number.isFinite(routeMinutes)&&routeMinutes>0?`~${Math.round(routeMinutes)} min · ${km.toFixed(1)} km`:`${km.toFixed(1)} km away`;
}
export function NearbyPharmacyCatalogue({products,providers,cart,onAdd,onDetail,pricing}){
 const canonical=products.filter(product=>product.active&&!product.removed);
 const branchesFor=product=>product.branches?.length?product.branches:providers.filter(provider=>provider.id===product.ownerId).map(provider=>({...provider,stockAvailable:product.stock>0,price:product.price,deliveryFee:provider.deliveryFee??provider.fee}));
 const bestBranch=product=>[...branchesFor(product)].sort((a,b)=>Number(b.stockAvailable&&b.priceValid!==false&&b.openNow)-Number(a.stockAvailable&&a.priceValid!==false&&a.openNow)||Number(b.stockAvailable&&b.priceValid!==false)-Number(a.stockAvailable&&a.priceValid!==false)||(a.distanceKm??Infinity)-(b.distanceKm??Infinity)||String(a.id).localeCompare(String(b.id)))[0];
 return <section className="nearby-catalogue"><div className="medicine-card-grid">{canonical.map(product=>{
   const branchRows=branchesFor(product),pharmacy=bestBranch(product),available=branchRows.some(branch=>branch.stockAvailable&&branch.priceValid!==false),hours=todaySchedule(pharmacy),detail=()=>onDetail({...product,detailBranch:pharmacy});
   const unit=Number(pharmacy?.price??product.price),dispensingFee=Number(pharmacy?.dispensingFee||0),dispensingVat=Number(pharmacy?.dispensingVat||0),deliveryConfigured=Number.isFinite(Number(pharmacy?.deliveryFee)),deliveryFee=deliveryConfigured?Number(pharmacy.deliveryFee):0,charges=medicineFeeBreakdown([{medicinePrice:unit,quantity:1,dispensingFee,dispensingVat}],deliveryFee,pricing),total=charges.totalMinor/100;
   return <article className="nearby-medicine-card" key={product.productKey||product.id}>
    <div className="nearby-medicine-visual">
     {product.image?<Image unoptimized fill sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 280px" className="nearby-medicine-image" src={product.image} alt={product.name}/>:<div className="nearby-medicine-image-placeholder"><Pill size={38}/></div>}
     <div className="nearby-medicine-shade"/>
     <div className="nearby-medicine-overlay-copy"><small>{product.category}{product.schedule?' · Schedule '+product.schedule:''}</small><button className="nearby-medicine-name" onClick={detail}>{product.name}</button><span>{[product.strength,product.form,product.packageSize].filter(Boolean).join(' · ')||'Medicine details'}</span><strong className="nearby-medicine-price">{money(total)}</strong><span className="nearby-medicine-distance"><Navigation size={13}/>{travelLabel(pharmacy)}</span><span className="nearby-medicine-hours"><Clock size={13}/>{pharmacy?.openNow===true?'Open now':pharmacy?.openNow===false?'Closed':'Hours'} · {hours}</span></div>
     <div className="nearby-medicine-actions"><button className="nearby-detail-button" onClick={detail} aria-label={'More details for '+product.name}><Info size={17}/></button><button aria-label={'Add '+product.name+' to basket'} disabled={!available} onClick={()=>onAdd(product)}><Plus size={16}/>{cart[product.id]?'Add another ('+cart[product.id]+')':'Add'}</button></div>
    </div>
    <div className="nearby-medicine-footer"><b>{pharmacy?.name||'HealthReachCare pharmacy'}</b><span>{available?'In stock':'Currently unavailable'}</span><small>Medicine {money(unit)} + platform {money(charges.platformFeeMinor/100)}{charges.platformVatMinor?' + VAT '+money(charges.platformVatMinor/100):''}{dispensingFee?' + dispensing '+money(dispensingFee+dispensingVat):''}{deliveryConfigured?' + delivery '+money(deliveryFee):' · delivery shown at checkout'}</small>
     {branchRows.length>1&&<details className="branch-comparison"><summary>Compare {branchRows.length} nearby branches</summary>{branchRows.map(branch=><div className="branch-option" key={branch.id}><b>{branch.name}</b><span>{branch.openNow?'Open now':'Closed'} · {branch.stockAvailable&&branch.priceValid!==false?'In stock':'Unavailable'}</span><span>{travelLabel(branch)} · {todaySchedule(branch)}</span><strong>{money(orderTotal(branch,product,pricing))} estimated total</strong></div>)}</details>}
    </div>
   </article>;
  })}</div>{!canonical.length&&<div className="panel padded"><h3>No medicines available right now</h3><p>Approved medicines appear here when a participating pharmacy has active stock.</p></div>}</section>;
}
