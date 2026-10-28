/** Patient catalogue projection from the same saved provider service records. */
import {homecareCatalogueForState,homecareMasterIdForService} from './homecare-catalogue.mjs';

// An approved provider's explicitly active, priced service with saved hours is
// itself the patient-listing opt-in. This also repairs visibility for existing
// records created before the separate listing-settings form was removed.
export function hasPatientBookableHomecareOffer(provider){
  return provider?.type==='Homecare'&&provider.publication?.manuallyHidden!==true&&(provider.services||[]).some(service=>service.parentId&&service.active===true&&!service.archived&&Number.isFinite(Number(service.rate))&&Number(service.rate)>0&&Array.isArray(service.availability)&&service.availability.length>0);
}

export function homecareMarketplaceEntries(s) {
  // Workspace API responses expose a projected catalogue object, while the
  // authenticated store keeps the canonical service definitions as an array.
  const catalogue=Array.isArray(s.homecareCatalogue?.services)?s.homecareCatalogue:homecareCatalogueForState(s,{includeInactive:false});
  const definitions=new Map([...(catalogue.categories||[]),...(catalogue.services||[])].map(item=>[item.id,item]));
  const providers = (s.providers || []).filter((provider) =>
    provider.type === 'Homecare' && provider.status === 'Approved' &&
    provider.publication?.manuallyHidden!==true && (hasPatientBookableHomecareOffer(provider)||(provider.acceptingOrders === true && provider.publication?.status === 'Published'))
  );
  if (s.realAccount && s.homecarePolicy?.managerId && !providers.some((provider) => provider.id === s.homecarePolicy.managerId)) {
    const manager = (s.providers || []).find((provider) => provider.id === s.homecarePolicy.managerId);
    if (manager?.status === 'Approved' && manager.acceptingOrders === true) {
      providers.push({ ...manager, services: s.companyHomecareServices || manager.services || [] });
    }
  }
  const entries = providers.flatMap((provider) => (provider.services || [])
    .map((service) => {
      const masterServiceId=homecareMasterIdForService(service,catalogue,provider.id),definition=definitions.get(masterServiceId);
      return {provider,service:definition?{...service,masterServiceId,name:definition.name,description:definition.id.startsWith('homecare-main-')?service.description:definition.description,category:definition.id.startsWith('homecare-main-')?definition.name:definition.category,parentId:definition.parentId||''}:service,definition};
    })
    .filter(({service,definition}) => !!definition && service.active !== false && !service.archived && Number(service.rate)>0 && definition.active!==false&&!definition.archived));
  // A category may intentionally have no direct price: its published sub-services
  // carry the prices. Keep that parent visible while at least one child is bookable.
  const main = providers.flatMap((provider) => (provider.services || [])
    .filter((service) => !service.parentId && !service.archived && (
      service.active !== false && Number(service.rate) > 0 ||
      Boolean(service.id) && entries.some((entry) => entry.provider.id === provider.id && entry.service.parentId === service.id)
    ))
    .map((service) => ({ provider, service })));
  return { providers, entries, main };
}
