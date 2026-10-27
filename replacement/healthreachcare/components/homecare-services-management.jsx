'use client';
import {useMemo,useState} from 'react';
import {BriefcaseBusiness,Save,Eye,EyeOff,Check} from 'lucide-react';
import {homecareServiceCategories} from '../lib/service-categories.mjs';
import {homecareCatalogueForState,homecareProviderOfferList} from '../lib/homecare-catalogue.mjs';

const box={background:'#fff',border:'1px solid #dce9e4',borderRadius:14,padding:18};
const money=n=>'R '+Number(n||0).toFixed(2);
const unit=v=>v==='hourly'?'/ hour':v==='per-visit'?'/ visit':v==='daily'?'/ day':'/ package';
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const clock=/^([01]\d|2[0-3]):[0-5]\d$/;
function inheritedHours(provider){
 if(Array.isArray(provider?.weeklyHours))return provider.weeklyHours.filter(day=>!day.closed).map(day=>({weekday:day.day,start:day.allDay?'00:00':day.open||'09:00',end:day.allDay?'23:59':day.close||'17:00'}));
 return (provider?.weekdays||[]).map(weekday=>({weekday,start:provider.openTime||'09:00',end:provider.closeTime||'17:00'})).filter(day=>Number.isInteger(day.weekday)&&day.weekday>=0&&day.weekday<=6);
}
function serviceStatus(service,companyManaged=false){
 if(service.catalogueArchived)return 'Archived';
 if(service.catalogueInactive)return 'Hidden in Patient catalogue';
 if(Number(service.rate)<=0)return 'Needs price';
 if(!service.availability?.length)return 'Needs availability';
 if(companyManaged&&!Number.isFinite(service.caregiverFee??service.staffRate))return 'Needs caregiver fee';
 return service.active?'Published':'Ready to publish';
}

export function HomecareServicesManagement({provider,act,busy,catalogue:providedCatalogue,companyManaged=false}){
 const fallback=useMemo(()=>homecareCatalogueForState({providers:provider?[provider]:[]},{includeInactive:true}),[provider]);
 const catalogue=providedCatalogue||fallback;
 const services=useMemo(()=>homecareProviderOfferList(provider,catalogue),[provider,catalogue]);
 const [notice,setNotice]=useState(''),[tab,setTab]=useState('Sub-services');
 const subServices=services.filter(value=>value.parentId&&!value.catalogueArchived);
 const ready=subServices.filter(value=>Number(value.rate)>0&&value.availability?.length>0&&(!companyManaged||Number.isFinite(value.caregiverFee??value.staffRate)));
 async function save(next,message){
  const result=await act('homecareServices',{services:next},message);
  if(result){setNotice('Service pricing and availability saved. The patient catalogue now uses this saved provider offer; existing bookings keep their confirmed price.');}
 }
 function readService(form,service,publish,unpublish=false){
  const fields=new FormData(form),selected=weekdays.flatMap((_,weekday)=>fields.get('day-'+weekday)?[{weekday,start:String(fields.get('start-'+weekday)||''),end:String(fields.get('end-'+weekday)||'')}]:[]);
  const rate=Number(fields.get('rate')||0);
  if(selected.some(value=>!clock.test(value.start)||!clock.test(value.end)||value.start>=value.end))throw Error('Enter a valid start and end time for each selected day.');
  if(publish&&(rate<=0||!selected.length))throw Error('A positive price and at least one available day and time are required to publish.');
  return {...service,rate,pricingModel:String(fields.get('pricingModel')||'hourly'),minDuration:Number(fields.get('minDuration')||1),maxDuration:Number(fields.get('maxDuration')||8),noticeHours:Number(fields.get('noticeHours')||0),caregiverFee:fields.get('caregiverFee')===''?undefined:Number(fields.get('caregiverFee')),qualificationRequirements:String(fields.get('qualificationRequirements')||'').trim(),serviceAreas:String(fields.get('serviceAreas')||'').split(',').map(value=>value.trim()).filter(Boolean),image:String(fields.get('image')||'').trim(),availability:selected,active:!service.catalogueArchived&&(publish||(!unpublish&&service.active))};
 }
 function editForm(service){
  const saved=service.availability?.length?service.availability:inheritedHours(provider);
  return <form className="form" onSubmit={async event=>{event.preventDefault();const form=event.currentTarget,intent=event.nativeEvent.submitter?.dataset.intent;try{const updated=readService(form,service,intent==='publish',intent==='unpublish'),next=services.map(value=>value.masterServiceId===service.masterServiceId?updated:value);await save(next,updated.active?'Homecare service published':intent==='unpublish'?'Homecare service unpublished':'Homecare price and settings saved');}catch(error){setNotice(error.message);}}}>
   <p>{service.description}</p>
   <label>Fixed patient price (R)<input name="rate" type="number" min="0.01" step="0.01" required defaultValue={Number(service.rate)>0?service.rate:''} placeholder="Enter price"/></label>
   <div className="two"><label>Pricing model<select name="pricingModel" defaultValue={service.pricingModel||'hourly'}><option value="hourly">Hourly</option><option value="per-visit">Per visit</option><option value="daily">Daily</option><option value="fixed-package">Package</option></select></label><label>Booking notice (hours)<input name="noticeHours" type="number" min="0" max="720" defaultValue={service.noticeHours||0}/></label></div>
   <div className="two"><label>Minimum duration (hours)<input name="minDuration" type="number" min="1" max="24" defaultValue={service.minDuration||1}/></label><label>Maximum duration (hours)<input name="maxDuration" type="number" min="1" max="24" defaultValue={service.maxDuration||8}/></label></div>
   <fieldset className="form"><legend>Service availability</legend><p>Set at least one day and time range before publishing. Availability is checked when the patient books.</p>{weekdays.map((day,weekday)=>{const value=saved.find(item=>item.weekday===weekday);return <div className="toolbar" key={day} style={{alignItems:'end',gap:8}}><label className="checkbox"><input type="checkbox" name={'day-'+weekday} defaultChecked={!!value}/>{day}</label><label>From<input name={'start-'+weekday} type="time" defaultValue={value?.start||'08:00'}/></label><label>Until<input name={'end-'+weekday} type="time" defaultValue={value?.end||'17:00'}/></label></div>;})}</fieldset>
   <label>Required caregiver qualifications (optional)<input name="qualificationRequirements" maxLength={500} defaultValue={service.qualificationRequirements||''}/></label>
   <label>Service areas (optional)<input name="serviceAreas" maxLength={600} defaultValue={(service.serviceAreas||[]).join(', ')}/></label>
   <label>Caregiver agreed fee {companyManaged?'(internal, required for company-managed bookings)':'(optional, internal)'}<input name="caregiverFee" type="number" min="0" step="0.01" required={companyManaged} defaultValue={service.caregiverFee??service.staffRate??''}/></label>
   <label>Service image URL (optional)<input name="image" type="url" placeholder="https://…" defaultValue={service.image||''}/></label>
   <div className="toolbar"><button type="submit" data-intent="save" disabled={busy}><Save size={16}/>Save price & availability</button><button type="submit" data-intent="publish" disabled={busy||provider?.status!=='Approved'||service.catalogueInactive||service.catalogueArchived}><Eye size={16}/>Save & publish</button>{service.active&&<button type="submit" data-intent="unpublish" className="outline" disabled={busy}><EyeOff size={16}/>Unpublish</button>}</div>
  </form>;
 }
 const categories=catalogue.categories?.length?catalogue.categories:homecareServiceCategories.map((value,index)=>({id:'category-'+index,...value}));
 const publishAll=()=>save(services.map(service=>service.parentId?{...service,active:!service.catalogueArchived&&Number(service.rate)>0&&service.availability?.length>0}:service),`Published ${ready.length} ready services`);
 return <section className="panel padded section"><div className="toolbar"><BriefcaseBusiness size={23}/><div><h2>Services & pricing</h2><p>These are the Patient Homecare catalogue services. Set your prices and availability; service names are managed in the shared catalogue.</p></div></div>
  {provider?.status!=='Approved'&&<p className="notice">Provider approval is required before patients can book your published services.</p>}{notice&&<p role="status" className="notice">{notice}</p>}
  <div role="tablist" aria-label="Service management" className="toolbar">{['Main Services','Sub-services','Preview as Patient'].map(value=><button key={value} role="tab" type="button" aria-selected={tab===value} className={tab===value?'':'outline'} onClick={()=>{setTab(value);}}>{value}</button>)}</div>
  {tab==='Main Services'&&<div className="section" style={{display:'grid',gap:12}}>{categories.map(category=>{const group=subServices.filter(service=>service.category===category.name),published=group.filter(service=>service.active&&service.rate>0),starting=published.length?Math.min(...published.map(service=>Number(service.rate))):null;return <article key={category.id} style={box}><h3>{category.name}</h3><p>{category.description}</p><p>{group.length} existing sub-service{group.length===1?'':'s'} · {published.length} published{starting!==null?` · From ${money(starting)}`:''}</p><button className="outline" type="button" onClick={()=>{setTab('Sub-services');}}>Manage prices</button></article>;})}</div>}
  {tab==='Sub-services'&&<><div className="toolbar" style={{justifyContent:'space-between'}}><p>Only saved sub-services appear here. New service definitions are added in the shared Patient Homecare catalogue by an administrator.</p><button type="button" className="outline" disabled={busy||provider?.status!=='Approved'||!ready.length} onClick={publishAll}><Check size={16}/>Publish all ready services ({ready.length})</button></div>{categories.map(category=>{const group=subServices.filter(service=>service.category===category.name);return <section key={category.id} className="section" style={box}><h3>{category.name}</h3><p>{category.description}</p>{group.map(service=><details key={service.masterServiceId} style={{...box,marginTop:10}}><summary style={{cursor:'pointer',fontWeight:700}}>{service.name} <span className="badge">{serviceStatus(service,companyManaged)}</span> <span>{Number(service.rate)>0?money(service.rate)+' '+unit(service.pricingModel):'Price not published'}</span></summary>{editForm(service)}</details>)}{!group.length&&<p>No sub-services are saved under this category yet.</p>}</section>;})}</>}
  {tab==='Preview as Patient'&&<section aria-label="Patient catalogue preview"><h3>Preview as Patient</h3><p>Only approved providers with a published price and saved availability are bookable. Patients see the same saved price and service definition.</p>{categories.map(category=>{const offers=subServices.filter(service=>service.category===category.name&&service.active&&service.rate>0&&!service.catalogueArchived);return <article key={category.id} style={{...box,marginTop:10}}><h3>{category.name}</h3>{offers.map(service=><p key={service.masterServiceId}><b>{service.name}</b> · {money(service.rate)} {unit(service.pricingModel)} · {service.availability.length} available day(s)</p>)}{!offers.length&&<small>No published offer yet.</small>}</article>;})}</section>}
 </section>;
}
