// Shared by patient discovery, provider profiles and server validation.
export const doctorServiceCategories=[{id:'doctor-general',name:'General Consultation',description:'Common health concerns',keywords:['general','family','primary','general practitioner','gp']},{id:'doctor-womens-health',name:"Women's Health",description:'Female health and wellness',keywords:['women','gynae','obstet','obstetric','gynaec']},{id:'doctor-child-health',name:'Child Health',description:'Paediatric care',keywords:['child','paedi','pedi','paediatric']},{id:'doctor-chronic-review',name:'Chronic Condition Review',description:'Diabetes, hypertension, etc.',keywords:['chronic','diabet','hypertens']},{id:'doctor-mental-health',name:'Mental Health',description:'Counselling and support',keywords:['mental','psych','counsell']},{id:'doctor-specialist',name:'Specialist Consultation',description:'E.g. cardiology, dermatology',keywords:['cardio','dermat','specialist','neurol','internal']}].map(v=>({...v,pattern:new RegExp(v.keywords.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'i')}));
export function doctorServiceCatalog(s,{includeInactive=false}={}){const saved=Array.isArray(s?.doctorServiceCatalog)&&s.doctorServiceCatalog.length?s.doctorServiceCatalog:doctorServiceCategories.map(({id,name,description,keywords})=>({id,name,description,keywords,active:true}));return saved.filter(v=>includeInactive||v.active!==false).map(v=>({...v,keywords:Array.isArray(v.keywords)?v.keywords:[],pattern:new RegExp((Array.isArray(v.keywords)?v.keywords:[]).filter(Boolean).map(k=>String(k).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')||String(v.name||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i')}));}
export const homecareServiceCategories=[{name:'Personal care',description:'Help with everyday personal care.'},{name:'Elderly care',description:'Support and companionship for older people.'},{name:'Mobility assistance',description:'Help with moving safely at home.'},{name:'Post-surgery care',description:'Support during recovery at home.'}];
const validClock=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function doctorHasSavedAvailability(d){
 const calendar=d.calendar?.rules?.some(r=>Array.isArray(r.weekdays)&&r.weekdays.length>0&&validClock(r.start)&&validClock(r.end)&&r.start<r.end);
 const weekly=Array.isArray(d.weekdays)&&d.weekdays.length>0&&Array.isArray(d.slots)&&d.slots.some(validClock);
 return !!(calendar||weekly);
}
export function refreshConnectedPublication(d){
 if(d.type==='Doctor')d.availabilityConfigured=doctorHasSavedAvailability(d);
 const ready=d.status==='Approved'&&!!d.name&&(d.type==='Homecare'?d.acceptingOrders===true&&d.availabilityConfigured===true:!!d.location&&d.acceptingOrders===true);
 // Publish a verified doctor's profile even before the calendar has bookable slots.
 // Discovery can then show the real profile, while slot validation still blocks booking.
 const services=d.type==='Homecare'?d.services?.some(v=>v.active!==false&&Number.isFinite(v.rate)&&v.rate>0):d.type==='Doctor'?d.professionalVerified===true&&!!d.qualifications&&!!d.registration&&(d.servicePrices?.some(v=>v.active!==false&&Number.isFinite(v.price)&&v.price>0)||d.fee>0)&&d.modes?.length>0:true;
 d.publication={...d.publication,status:ready&&services&&!d.publication?.manuallyHidden?'Published':'Draft'};
 return d;
}
