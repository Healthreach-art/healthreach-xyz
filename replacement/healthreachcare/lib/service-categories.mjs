// Shared by patient discovery, provider profiles and server validation.
export const doctorServiceCategories=[{name:'General Consultation',description:'Common health concerns',pattern:/general|family|primary/i},{name:'Women’s Health',description:'Female health and wellness',pattern:/women|gynae|obstet/i},{name:'Child Health',description:'Paediatric care',pattern:/child|paedi|pedi/i},{name:'Chronic Condition Review',description:'Diabetes, hypertension, etc.',pattern:/chronic|diabet|hypertens/i},{name:'Mental Health',description:'Counselling and support',pattern:/mental|psych|counsell/i},{name:'Specialist Consultation',description:'E.g. cardiology, dermatology',pattern:/cardio|dermat|specialist|neurol|internal/i}];
export const homecareServiceCategories=[{name:'Personal care',description:'Help with everyday personal care.'},{name:'Elderly care',description:'Support and companionship for older people.'},{name:'Mobility assistance',description:'Help with moving safely at home.'},{name:'Post-surgery care',description:'Support during recovery at home.'}];
export function refreshConnectedPublication(d){
 const ready=d.status==='Approved'&&!!d.name&&!!d.location&&d.acceptingOrders===true&&d.availabilityConfigured===true;
 const services=d.type==='Homecare'?d.services?.some(v=>v.active!==false&&Number.isFinite(v.rate)&&v.rate>0):d.type==='Doctor'?!!d.qualifications&&!!d.registration&&d.fee>0&&d.modes?.length>0&&(d.slots?.length>0||d.calendar?.rules?.length>0):true;
 d.professionalVerified=d.type==='Doctor'&&d.status==='Approved'&&!!d.qualifications&&!!d.registration;
 d.publication={...d.publication,status:ready&&services&&!d.publication?.manuallyHidden?'Published':'Draft'};
 return d;
}
