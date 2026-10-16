export function isMedicineExpired(expiryDate: unknown, now = Date.now()): boolean {
  if (expiryDate == null || expiryDate === "") return false;
  const expiresAt = expiryDate instanceof Date
    ? expiryDate.getTime()
    : typeof expiryDate === "string"
      ? new Date(expiryDate).getTime()
      : Number.NaN;
  return !Number.isFinite(expiresAt) || expiresAt < now;
}
