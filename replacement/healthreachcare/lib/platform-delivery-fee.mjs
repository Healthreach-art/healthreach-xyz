export const defaultDeliveryBaseFee = 32;
export const defaultDeliveryPerKmRate = 12;

export function platformDeliveryFee(s, provider, distanceKm = provider?.distanceKm) {
 const policy=s.platformDelivery||{};
 const base=Number.isFinite(policy.baseFee)?policy.baseFee:defaultDeliveryBaseFee;
 const perKm=Number.isFinite(policy.perKmRate)?policy.perKmRate:defaultDeliveryPerKmRate;
 if(!Number.isFinite(base)||base<0||!Number.isFinite(perKm)||perKm<0)throw Error('Delivery pricing is not configured. Choose pickup or contact support.');
 if(!Number.isFinite(distanceKm)||distanceKm<0)throw Error('A confirmed pharmacy and delivery location are needed to calculate the per-kilometre delivery fee. Choose pickup or update the pharmacy map pin.');
 return Math.round((base+perKm*distanceKm)*100)/100;
}
