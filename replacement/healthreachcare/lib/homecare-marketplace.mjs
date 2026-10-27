/** Patient catalogue projection from the same saved provider service records. */
export function homecareMarketplaceEntries(s) {
  const providers = (s.providers || []).filter((provider) =>
    provider.type === 'Homecare' && provider.status === 'Approved' &&
    provider.acceptingOrders === true && provider.publication?.status === 'Published'
  );
  if (s.realAccount && s.homecarePolicy?.managerId && !providers.some((provider) => provider.id === s.homecarePolicy.managerId)) {
    const manager = (s.providers || []).find((provider) => provider.id === s.homecarePolicy.managerId);
    if (manager?.status === 'Approved' && manager.acceptingOrders === true) {
      providers.push({ ...manager, services: s.companyHomecareServices || manager.services || [] });
    }
  }
  const entries = providers.flatMap((provider) => (provider.services || [])
    .filter((service) => service.active !== false && !service.archived)
    .map((service) => ({ provider, service })));
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
