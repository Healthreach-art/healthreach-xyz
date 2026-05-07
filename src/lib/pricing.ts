// Customer-facing pricing helpers.
// Pharmacies and drivers store/see BASE values. Customers see final prices
// with platform markup applied transparently — they never see the markup line.

export const MED_MARKUP = 0.15;       // 15% on medication price
export const DELIVERY_MARKUP = 0.07;  // 7% on delivery fee
export const BASE_DELIVERY_FEE = 25;  // R25 base, used unless an offer overrides

/** Price a customer sees for a single medication unit. */
export function customerPrice(basePrice: number): number {
  return Math.round(basePrice * (1 + MED_MARKUP) * 100) / 100;
}

/** Delivery fee a customer sees. */
export function customerDeliveryFee(baseFee: number = BASE_DELIVERY_FEE): number {
  return Math.round(baseFee * (1 + DELIVERY_MARKUP) * 100) / 100;
}

/** Build a customer-facing total from base price + qty + base delivery fee. */
export function customerTotal(basePrice: number, qty: number, baseFee: number = BASE_DELIVERY_FEE): number {
  return Math.round((customerPrice(basePrice) * qty + customerDeliveryFee(baseFee)) * 100) / 100;
}

/** Format ZAR. */
export function zar(amount: number): string {
  return `R ${Number(amount).toFixed(2)}`;
}
