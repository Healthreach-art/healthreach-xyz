export type MedicationRecord = Record<string, unknown>;

export function expiryMillis(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  return Number.NaN;
}

export function canPublishForPharmacy(uid: string, owner: unknown, role: unknown, profileApproval: unknown, pharmacyApproval: unknown) {
  return owner === uid && role === "pharmacy" && profileApproval === "approved" && pharmacyApproval === "approved";
}

export function isPublishableMedication(medication: MedicationRecord, now = Date.now()) {
  const expiresAt = expiryMillis(medication.expiry_date);
  return medication.publish_requested === true && medication.is_active === true
    && medication.is_demo === false && typeof medication.name === "string" && Boolean(medication.name.trim())
    && typeof medication.price === "number" && Number.isFinite(medication.price) && medication.price >= 0
    && typeof medication.stock_quantity === "number" && Number.isSafeInteger(medication.stock_quantity)
    && medication.stock_quantity > 0 && typeof medication.requires_prescription === "boolean"
    && (expiresAt === null || Number.isFinite(expiresAt) && expiresAt >= now);
}

export function prepareMedicationPublication(medication: MedicationRecord, explicitItemRequest: boolean, now = Date.now()):
  { eligible: true; patch: { is_active: true; publish_requested: true } } | { eligible: false; reason: string } {
  if (medication.is_demo !== false) return { eligible: false, reason: "Not confirmed as genuine inventory" };
  if (medication.is_active === false) return { eligible: false, reason: "Archived" };
  if (medication.publish_requested === false && !explicitItemRequest) return { eligible: false, reason: "Publication was explicitly disabled" };
  if (medication.is_active !== undefined && typeof medication.is_active !== "boolean"
    || medication.publish_requested !== undefined && typeof medication.publish_requested !== "boolean") {
    return { eligible: false, reason: "Invalid publication settings; edit this medicine" };
  }
  if (typeof medication.requires_prescription !== "boolean") return { eligible: false, reason: "Confirm prescription classification by editing this medicine" };
  const patch = { is_active: true, publish_requested: true } as const;
  if (!isPublishableMedication({ ...medication, ...patch }, now)) {
    return { eligible: false, reason: "Check medicine name, price, available stock and expiry" };
  }
  return { eligible: true, patch };
}