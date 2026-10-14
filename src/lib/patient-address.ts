export interface PatientAddress {
  id?: string;
  label?: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

export const PATIENT_ADDRESS_CHANGED = "healthreach:patient-address-changed";

export function patientAddressStorageKey(userId: string) {
  return `healthreach_active_address_${userId}`;
}

export function readPatientAddress(userId: string): PatientAddress | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(patientAddressStorageKey(userId));
    if (!value) return null;
    const parsed = JSON.parse(value) as PatientAddress;
    return typeof parsed.address === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function setPatientAddress(userId: string, address: PatientAddress) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(patientAddressStorageKey(userId), JSON.stringify(address));
  window.dispatchEvent(new CustomEvent(PATIENT_ADDRESS_CHANGED, { detail: address }));
}
