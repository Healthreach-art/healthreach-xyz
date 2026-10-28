'use client';
import {useState} from 'react';
import {Search,ChevronRight,UserRound,Heart,Activity,Accessibility,Pill,Stethoscope,ArrowLeft} from 'lucide-react';
import {homecareMarketplaceEntries} from '../lib/homecare-marketplace.mjs';
import {homecareCatalogueForState} from '../lib/homecare-catalogue.mjs';

export function HomecareMarketplace({s,busy,onChoose}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState(null);
 const {entries}=homecareMarketplaceEntries(s);
 const projected=Array.isArray(s.homecareCatalogue?.services)?s.homecareCatalogue:null;
 const catalogue=projected?.categories?.length?projected:homecareCatalogueForState(s,{includeInactive:false});
 const categories=(catalogue.categories||[]).filter(category=>category.active!==false&&!category.archived);
 const visible=categories.filter(category=>[category.name,category.description].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 function iconFor(name){if(/elder|compan/i.test(name))return Heart;if(/surg|recover/i.test(name))return Activity;if(/mobil/i.test(name))return Accessibility;if(/medic/i.test(name))return Pill;if(/special/i.test(name))return Stethoscope;return UserRound;}
 const money=n=>'R '+Number(n||0).toFixed(2),priceLabel=value=>value==='hourly'?'/ hour':value==='per-visit'?'/ visit':value==='daily'?'/ day':'/ package';
 function offersFor(definition){return entries.filter(({service})=>service.masterServiceId===definition.id);}
 const categoryOffers=category=>entries.filter(({service})=>service.category===category.name&&!service.parentId&&service.name.toLocaleLowerCase()===category.name.toLocaleLowerCase());
 const selectedDefinitions=selected?(catalogue.services||[]).filter(value=>value.category===selected.name&&!value.archived&&value.active!==false):[];
 const selectedDirectOffers=selected?categoryOffers(selected):[];
 const hasBookableSelection=selectedDefinitions.some(definition=>offersFor(definition).length>0)||selectedDirectOffers.length>0;
 return <div className="doctor-booking booking-journey homecare-marketplace"><section className="journey-surface journey-screen-0">
  {selected?<><button className="homecare-back" type="button" onClick={()=>setSelected(null)}><ArrowLeft size={16}/><span>Back to services</span></button><h1>{selected.name}</h1><p className="journey-intro">{selected.description} Choose an available service and review its published price before booking.</p><div className="journey-services">
   {selectedDefinitions.flatMap(definition=>offersFor(definition).map(({provider,service})=><button key={provider.id+':'+service.id} className="journey-service" type="button" aria-label={`Book ${definition.name} for ${money(service.rate)} ${priceLabel(service.pricingModel)}`} disabled={busy} onClick={()=>onChoose({service:service.name,serviceId:service.id,providerId:provider.id})}><span className="journey-service-icon"><Heart size={21}/></span><span className="journey-service-copy"><b>{service.name}</b><small>{service.description||definition.description}</small><small className="journey-service-price">{money(service.rate)} {priceLabel(service.pricingModel)}</small></span><ChevronRight size={17}/></button>))}
   {selectedDirectOffers.map(({provider,service})=><button key={provider.id+':'+service.id} className="journey-service" type="button" aria-label={`Book ${service.name} for ${money(service.rate)} ${priceLabel(service.pricingModel)}`} disabled={busy} onClick={()=>onChoose({service:service.name,serviceId:service.id,providerId:provider.id})}><span className="journey-service-icon"><UserRound size={21}/></span><span className="journey-service-copy"><b>{service.name}</b><small>{service.description}</small><small className="journey-service-price">{money(service.rate)} {priceLabel(service.pricingModel)}</small></span><ChevronRight size={17}/></button>)}
   {!selectedDefinitions.length&&!selectedDirectOffers.length&&<p className="journey-note" role="status">No services have been added to this category yet.</p>}
   {!!selectedDefinitions.length&&!hasBookableSelection&&<p className="journey-note" role="status">No services with a published price are available in this category yet. Please try another service or check again later.</p>}
  </div></>:<><h1>Book Home Care</h1><p className="journey-intro">Choose a service and review a published price before booking.</p><label className="journey-need-search"><Search size={16}/><input aria-label="Search homecare services" placeholder="What do you need help with?" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="journey-services">{visible.map((category,index)=>{const Icon=iconFor(category.name),offers=categoryOffers(category),published=offers.filter(value=>Number(value.service.rate)>0),starting=published.length?Math.min(...published.map(value=>Number(value.service.rate))):null;return <button key={category.name} className="journey-service" type="button" disabled={busy} onClick={()=>setSelected(category)}><span className={'journey-service-icon tone-'+index%6}><Icon size={21}/></span><span><b>{category.name}</b><small>{category.description}</small><small style={{color:'#0B9C70',fontWeight:600}}>{starting===null?'Services and prices shown before booking':`From ${money(starting)}`}</small></span><ChevronRight size={17}/></button>;})}</div>{!visible.length&&<div className="journey-note" role="status"><h3>No matching services</h3><p>Try another search.</p><button className="outline" onClick={()=>setQuery('')}>Clear search</button></div>}</>}
 </section>{!s.realAccount&&<p className="journey-demo-label">Demo environment · simulated bookings and payments</p>}</div>;
}
