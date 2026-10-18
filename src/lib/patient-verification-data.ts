import { firestoreClient } from "@/lib/firestore-client";
import type { PatientVerification } from "@/lib/patient-verification";

export async function fetchVerification(userId: string): Promise<PatientVerification | null> {
  const { data, error } = await firestoreClient
    .from("patient_verifications")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as PatientVerification | null) ?? null;
}
