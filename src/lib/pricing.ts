// Customer-facing pricing helpers.
// Pharmacies see only their base medicine price. Drivers see only their
// delivery earnings. Customers see only the final marked-up totals.

export const MED_MARKUP = 0.15;       // 15% on medication price
export const DELIVERY_MARKUP = 0.07;  // 7% on the customer-visible delivery fee
export const BASE_DELIVERY_FEE = 25;  // R25 base delivery fee
// Driver receives 0% of base fee; platform keeps the entire delivery line
// (15% of base + 7% customer markup). Driver earnings come from per-delivery
// bonuses set by the platform — default 0 for now.
export const DRIVER_BASE_PAYOUT = 0;

export function customerPrice(basePrice: number): number {
  return Math.round(basePrice * (1 + MED_MARKUP) * 100) / 100;
}

export function customerDeliveryFee(baseFee: number = BASE_DELIVERY_FEE): number {
  return Math.round(baseFee * (1 + DELIVERY_MARKUP) * 100) / 100;
}

export function customerTotal(basePrice: number, qty: number, baseFee: number = BASE_DELIVERY_FEE): number {
  return Math.round((customerPrice(basePrice) * qty + customerDeliveryFee(baseFee)) * 100) / 100;
}

/** Full breakdown used when creating a payment record. */
export function paymentBreakdown(basePrice: number, qty: number, baseFee: number = BASE_DELIVERY_FEE) {
  const subtotal = Math.round(customerPrice(basePrice) * qty * 100) / 100;
  const delivery_fee = customerDeliveryFee(baseFee);
  const total_paid = Math.round((subtotal + delivery_fee) * 100) / 100;
  const pharmacy_amount = Math.round(basePrice * qty * 100) / 100;
  const driver_amount = DRIVER_BASE_PAYOUT;
  const platform_fee = Math.round((total_paid - pharmacy_amount - driver_amount) * 100) / 100;
  return { subtotal, delivery_fee, platform_fee, total_paid, pharmacy_amount, driver_amount };
}

export function zar(amount: number): string {
  return `R ${Number(amount).toFixed(2)}`;
}
