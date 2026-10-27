import {homecareServiceCategories} from './service-categories.mjs';

const slug=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const clean=value=>typeof value==='string'?value.trim().slice(0,500):'';
const nameKey=value=>String(value||'').trim().toLocaleLowerCase();
const mainId=category=>category.id||`homecare-main-${slug(category.name)}`;

/** The original four categories remain built in; extra shared categories are admin-managed. */
export function homecareCategoriesForState(s,{includeInactive=true}={}){
 const core=homecareServiceCategories.map(value=>({id:`homecare-main-${slug(value.name)}`,...value,active:true,archived:false,isCore:true}));
 const extras=Array.isArray(s?.homecareMainServices)?s.homecareMainServices.filter(value=>value&&typeof value==='object'&&typeof value.id==='string'&&typeof value.name==='string').map(value=>({id:value.id,name:clean(value.name).slice(0,100),description:clean(value.description),active:value.active!==false&&!value.archived,archived:value.archived===true,isCore:false,createdAt:value.createdAt||null,updatedAt:value.updatedAt||null})):[];
 const all=[...core,...extras];
 return includeInactive?all:all.filter(value=>value.active&&!value.archived);
}
const categoryFor=(value,categories=homecareServiceCategories)=>categories.find(item=>nameKey(item.name)===nameKey(value));

/**
 * Read the shared Homecare service definitions. Older application records kept
 * definitions alongside each provider's price; fold those saved definitions
 * into one catalogue view without changing the source records or inventing
 * sub-services. New definitions are stored once in s.homecareCatalogue.
 */
export function homecareCatalogueForState(s,{includeInactive=true}={}){
 const categories=homecareCategoriesForState(s,{includeInactive}).map(value=>({id:mainId(value),name:value.name,description:value.description,category:value.name,parentId:'',active:value.active!==false,archived:value.archived===true,isCore:value.isCore===true}));
 const categoryDefinitions=homecareCategoriesForState(s,{includeInactive:true});
 const definitions=new Map();
 for(const item of Array.isArray(s.homecareCatalogue)?s.homecareCatalogue:[]){
  const category=categoryFor(item.category,categoryDefinitions);if(!category||!item.id||!clean(item.name))continue;
  const id=String(item.id).slice(0,160);
  definitions.set(id,{id,category:category.name,parentId:mainId(category),name:clean(item.name).slice(0,100),description:clean(item.description),pricingModel:['hourly','per-visit','daily','fixed-package'].includes(item.pricingModel)?item.pricingModel:'hourly',minDuration:Number.isInteger(item.minDuration)?item.minDuration:1,maxDuration:Number.isInteger(item.maxDuration)?item.maxDuration:8,availability:Array.isArray(item.availability)?item.availability:[],active:item.active!==false&&category.active!==false&&!category.archived,archived:item.archived===true,updatedAt:item.updatedAt||null});
 }
 const saved=[...(s.providers||[]).filter(provider=>provider.type==='Homecare').flatMap(provider=>(provider.services||[]).map(service=>({service,ownerId:provider.id}))),...(s.companyHomecareServices||[]).map(service=>({service,ownerId:'company'}))];
 for(const {service,ownerId} of saved){
  if(!service||typeof service!=='object'||service.archived)continue;
  const category=categoryFor(service.category,categoryDefinitions)||categoryFor(service.name,categoryDefinitions);if(!category)continue;
  // Main category rows are category definitions, not sub-services.
  if(!service.parentId&&categoryFor(service.name,categoryDefinitions))continue;
  const name=clean(service.name);if(!name)continue;
  const owned=service.providerDefined===true||typeof service.masterServiceId==='string'&&service.masterServiceId.startsWith('provider-service-');
  const id=typeof service.masterServiceId==='string'&&service.masterServiceId.startsWith('homecare-service-')||typeof service.masterServiceId==='string'&&service.masterServiceId.startsWith('provider-service-')?service.masterServiceId:owned?`provider-service-${slug(ownerId)}-${slug(service.id||name)}`:`homecare-service-${slug(category.name)}-${slug(name)}`;
  if(definitions.has(id))continue;
  const duplicate=owned?null:[...definitions.values()].find(item=>item.category===category.name&&nameKey(item.name)===nameKey(name)&&!item.ownerProviderId);
  if(duplicate)continue;
  definitions.set(id,{id,category:category.name,parentId:mainId(category),name:name.slice(0,100),description:clean(service.description),pricingModel:['hourly','per-visit','daily','fixed-package'].includes(service.pricingModel)?service.pricingModel:'hourly',minDuration:Number.isInteger(service.minDuration)?service.minDuration:1,maxDuration:Number.isInteger(service.maxDuration)?service.maxDuration:8,availability:Array.isArray(service.availability)?service.availability:[],active:service.catalogueActive!==false&&!category.archived,archived:category.archived===true,ownerProviderId:owned&&ownerId!=='company'?ownerId:null,providerDefined:owned,updatedAt:service.updatedAt||null});
 }
 const services=[...definitions.values()].filter(item=>includeInactive||item.active&&!item.archived);
 return {categories,services};
}

export function normalizeHomecareCatalogueUpdate(input,current,now,categoryList=homecareServiceCategories){
 if(!Array.isArray(input)||input.length>200)throw Error('Review the Homecare service list and try again.');
 const ids=new Set(),names=new Set();
 return input.map(item=>{
  if(!item||typeof item!=='object')throw Error('Review each Homecare service.');
  const id=typeof item.id==='string'&&item.id.length<=160?item.id:`homecare-service-${slug(item.category)}-${slug(item.name)}`;
  if(!id||ids.has(id))throw Error('Each Homecare sub-service must be unique.');ids.add(id);
  const category=categoryFor(item.category,categoryList);if(!category||category.archived)throw Error('Choose an active Homecare main service.');
  const name=clean(item.name);if(!name)throw Error('Enter a sub-service name.');
  const key=`${category.name.toLocaleLowerCase()}\0${name.toLocaleLowerCase()}`;if(names.has(key))throw Error('A service with this name already exists under that category.');names.add(key);
  const previous=(current||[]).find(value=>value.id===id);
  const description=clean(item.description);if(!description)throw Error('Add a patient-facing service description.');
  const pricingModel=['hourly','per-visit','daily','fixed-package'].includes(item.pricingModel)?item.pricingModel:'hourly';
  const minDuration=Number(item.minDuration??1),maxDuration=Number(item.maxDuration??8);
  if(!Number.isInteger(minDuration)||!Number.isInteger(maxDuration)||minDuration<1||maxDuration<minDuration||maxDuration>24)throw Error('Choose a valid service duration.');
  const availability=Array.isArray(item.availability)?item.availability.filter(v=>v&&Number.isInteger(v.weekday)&&v.weekday>=0&&v.weekday<=6&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.start)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.end)&&v.start<v.end).slice(0,7):[];
  return {id,category:category.name,parentId:mainId(category),name:name.slice(0,100),description,pricingModel,minDuration,maxDuration,availability,active:item.active!==false,archived:item.archived===true,createdAt:previous?.createdAt||now,updatedAt:now};
 });
}

export function homecareMasterIdForService(service,catalogue){
 if(typeof service?.masterServiceId==='string'&&catalogue.services.some(item=>item.id===service.masterServiceId))return service.masterServiceId;
 if(typeof service?.id==='string'&&catalogue.services.some(item=>item.id===service.id))return service.id;
 const category=categoryFor(service?.category,catalogue.categories)||categoryFor(service?.name,catalogue.categories);
 if(!category)return null;
 if(!service?.parentId&&categoryFor(service?.name,catalogue.categories))return mainId(category);
 return catalogue.services.find(item=>item.category===category.name&&nameKey(item.name)===nameKey(service?.name)&&(!item.ownerProviderId||item.ownerProviderId===service?.providerId))?.id||null;
}

/** Provider-specific price/availability rows joined to the shared definitions. */
export function homecareProviderOfferList(provider,catalogue){
 const existing=provider?.services||[];
 const categories=(catalogue.categories||[]).map(definition=>{
  return {id:definition.id,masterServiceId:definition.id,name:definition.name,description:definition.description,category:definition.name,parentId:'',rate:0,pricingModel:'hourly',minDuration:1,maxDuration:8,availability:[],active:false};
 });
 const services=(catalogue.services||[]).filter(definition=>!definition.ownerProviderId||definition.ownerProviderId===provider?.id).map(definition=>{
  const old=existing.find(value=>homecareMasterIdForService(value,catalogue)===definition.id);
  const inherited=Array.isArray(provider?.weeklyHours)?provider.weeklyHours.filter(day=>!day.closed).map(day=>({weekday:day.day,start:day.allDay?'00:00':day.open||'09:00',end:day.allDay?'23:59':day.close||'17:00'})):(provider?.weekdays||[]).map(weekday=>({weekday,start:provider.openTime||'09:00',end:provider.closeTime||'17:00'}));
  return {...definition,...old,id:old?.id||`offer-${provider?.id||'provider'}-${definition.id}`,masterServiceId:definition.id,name:definition.name,description:definition.description,category:definition.category,parentId:definition.parentId,active:definition.active&&!definition.archived&&old?.active===true,rate:Number(old?.rate)||0,pricingModel:old?.pricingModel||definition.pricingModel,minDuration:old?.minDuration||definition.minDuration,maxDuration:old?.maxDuration||definition.maxDuration,availability:Array.isArray(old?.availability)&&old.availability.length?old.availability:inherited,catalogueArchived:definition.archived,catalogueInactive:definition.active===false};
 });
 const retained=existing.filter(value=>!homecareMasterIdForService(value,catalogue));
 return [...categories,...services,...retained.map(value=>({...value,active:false,catalogueArchived:true}))];
}

export function projectHomecareCatalogue(out,s,role){
 const fullCatalogue=homecareCatalogueForState(s,{includeInactive:true});
 const catalogue={categories:fullCatalogue.categories.filter(item=>role!=='Patient'||item.active&&!item.archived),services:fullCatalogue.services.filter(item=>role!=='Patient'||item.active&&!item.archived)};
 out.homecareCatalogue=catalogue;
 out.homecareServiceRequests=(s.homecareServiceRequests||[]).filter(item=>role==='Admin'||item.providerId===s.session?.accountId).map(item=>({...item}));
 const projectOffer=service=>{
  const masterId=homecareMasterIdForService(service,fullCatalogue);
  const definition=masterId?.startsWith('homecare-main-')?fullCatalogue.categories.find(item=>item.id===masterId):fullCatalogue.services.find(item=>item.id===masterId);
  return definition?{...service,masterServiceId:definition.id,name:definition.name,description:definition.description,category:definition.name&&masterId.startsWith('homecare-main-')?definition.name:definition.category,parentId:masterId.startsWith('homecare-main-')?'':definition.parentId,active:service.active!==false&&definition.active!==false&&!definition.archived,catalogueArchived:definition.archived===true,catalogueInactive:definition.active===false}:service;
 };
 out.providers=(out.providers||[]).map(provider=>provider.type!=='Homecare'?provider:{...provider,services:(provider.services||[]).map(service=>{
  return projectOffer(service);
 })});
 if(Array.isArray(out.companyHomecareServices))out.companyHomecareServices=out.companyHomecareServices.map(projectOffer);
 return out;
}
