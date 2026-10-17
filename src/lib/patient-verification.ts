export interface PatientVerificationFields {
  id_document_path?: string | null;
  selfie_path?: string | null;
  selfie_with_id_path?: string | null;
  id_number?: string | null;
  status?: string | null;
}

export interface PatientVerification extends PatientVerificationFields {
  user_id: string;
  id_document_path: string | null;
  selfie_path: string | null;
  selfie_with_id_path: string | null;
  id_number: string | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
}

export function isValidSouthAfricanId(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  const shortYear = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  const currentYear = new Date().getUTCFullYear();
  const validDate = [1900 + shortYear, 2000 + shortYear].some((year) => {
    if (year > currentYear) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  });
  if (!validDate) return false;

  let sum = 0;
  let doubleDigit = false;
  for (let i = value.length - 1; i >= 0; i -= 1) {
    let digit = Number(value[i]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

export function isValidIdentityNumber(value: string) {
  const normalized = value.trim().toUpperCase();
  if (/^\d{13}$/.test(normalized)) return isValidSouthAfricanId(normalized);
  return /^[A-Z0-9]*[A-Z][A-Z0-9]{5,19}$/.test(normalized);
}

export function isVerificationComplete(verification: PatientVerificationFields | null) {
  return !!(
    verification?.id_document_path &&
    verification.selfie_path &&
    verification.selfie_with_id_path &&
    verification.id_number &&
    isValidIdentityNumber(verification.id_number)
  );
}

export function isIdentityVerified(verification: PatientVerificationFields | null) {
  return verification?.status === "approved" && isVerificationComplete(verification);
}
