// Shared by patient discovery, provider profiles and server validation.
export const doctorServiceCategories=[{name:'General Consultation',description:'Common health concerns',pattern:/general|family|primary|\bgp\b/i},{name:"Women's Health",description:'Female health and wellness',pattern:/women|gynae|obstet/i},{name:'Child Health',description:'Paediatric care',pattern:/child|paedi|pedi/i},{name:'Chronic Condition Review',description:'Diabetes, hypertension, etc.',pattern:/chronic|diabet|hypertens/i},{name:'Mental Health',description:'Counselling and support',pattern:/mental|psych|counsell/i},{name:'Specialist Consultation',description:'E.g. cardiology, dermatology',pattern:/cardio|dermat|specialist|neurol|internal/i}];
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
 const services=d.type==='Homecare'?d.services?.some(v=>v.active!==false&&Number.isFinite(v.rate)&&v.rate>0):d.type==='Doctor'?d.professionalVerified===true&&!!d.qualifications&&!!d.registration&&d.fee>0&&d.modes?.length>0:true;
 d.publication={...d.publication,status:ready&&services&&!d.publication?.manuallyHidden?'Published':'Draft'};
 return d;
}
