// Customer-facing pricing helpers.
//
// New formula (May 2026):
//   Medicine: customer pays  base × 1.15 (pharmacy keeps 100% of base, admin keeps 15% markup)
//   Delivery: R26 base + R10 per km (charged even when km < 1)
//   Driver:   85% of the delivery line
//   Admin:    medicine markup + 15% of delivery + payment processing fee
//
// Pharmacies and drivers each only see their own slice; admin sees the full
// breakdown including the transaction (processing) fee.

export const MED_MARKUP = 0.15;           // 15% on top of medicine base
export const DELIVERY_BASE = 26;          // R26 flat
export const DELIVERY_PER_KM = 10;        // R10 per km, no rounding
export const DRIVER_SHARE = 0.85;         // driver share of delivery
export const ADMIN_DELIVERY_SHARE = 0.15; // admin share of delivery
export const TXN_FEE_PCT = 0.029;         // Paystack-style 2.9% + R1
export const TXN_FEE_FIXED = 1;

// Legacy default for back-compat with old code paths
export const BASE_DELIVERY_FEE = DELIVERY_BASE;

export function customerPrice(basePrice: number): number {
  return Math.round(basePrice * (1 + MED_MARKUP) * 100) / 100;
}

/** Delivery fee shown to the customer for a given pickup→drop distance. */
export function deliveryFeeForKm(km: number | null | undefined): number {
  const safeKm = Math.max(0, Number.isFinite(km as number) ? (km as number) : 0);
  return Math.round((DELIVERY_BASE + DELIVERY_PER_KM * safeKm) * 100) / 100;
}

/** Legacy signature — still used by older callers. */
export function customerDeliveryFee(km: number = 0): number {
  return deliveryFeeForKm(km);
}

/** ETA from distance — rough urban heuristic. */
export function etaMinutesForKm(km: number): { min: number; max: number; label: string } {
  const safeKm = Math.max(0, km);
  // ~25 km/h effective with stops; ±5 min cushion
  const mid = 10 + Math.round((safeKm / 25) * 60);
  const min = Math.max(15, mid - 5);
  const max = Math.max(min + 10, mid + 10);
  return { min, max, label: `${min}–${max} min` };
}

export function customerTotal(basePrice: number, qty: number, km: number = 0): number {
  return Math.round((customerPrice(basePrice) * qty + deliveryFeeForKm(km)) * 100) / 100;
}

/** Full breakdown used when creating a payment record / admin reporting. */
export function paymentBreakdown(basePrice: number, qty: number, km: number = 0) {
  const subtotal = Math.round(customerPrice(basePrice) * qty * 100) / 100;
  const delivery_fee = deliveryFeeForKm(km);
  const total_paid = Math.round((subtotal + delivery_fee) * 100) / 100;
  const pharmacy_amount = Math.round(basePrice * qty * 100) / 100;
  const driver_amount = Math.round(delivery_fee * DRIVER_SHARE * 100) / 100;
  const transaction_fee = Math.round((total_paid * TXN_FEE_PCT + TXN_FEE_FIXED) * 100) / 100;
  const platform_fee = Math.round(
    (total_paid - pharmacy_amount - driver_amount - transaction_fee) * 100,
  ) / 100;
  return { subtotal, delivery_fee, platform_fee, transaction_fee, total_paid, pharmacy_amount, driver_amount };
}

export function zar(amount: number): string {
  return `R ${Number(amount).toFixed(2)}`;
}
