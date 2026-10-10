import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { firestoreAdmin } from "@/lib/firestore-admin";

export interface PatientMarketplaceMedication {
  id: string;
  pharmacy_id: string;
  name: string;
  price: number;
  stock_quantity: number;
  requires_prescription: boolean | null;
  image_url: string | null;
  description: string | null;
  category: string | null;
}

export interface PatientMarketplacePharmacy {
  user_id: string;
  organization_name: string | null;
  full_name: string;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PatientMarketplaceBranch {
  id: string;
  pharmacy_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  is_primary: boolean;
}

export const listPatientMarketplace = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async () => {
    const empty = {
      meds: [] as PatientMarketplaceMedication[],
      pharmacies: [] as PatientMarketplacePharmacy[],
      branches: [] as PatientMarketplaceBranch[],
    };

    // Firestore rejects an inequality filter combined with orderBy on a different
    // field, so filter by stock server-side and sort by name in memory.
    const { data: rawMeds, error: medsError } = await firestoreAdmin
      .from("medications")
      .select("id, pharmacy_id, name, price, stock_quantity, requires_prescription, image_url, description, category")
      .gt("stock_quantity", 0);

    if (medsError) {
      console.error("listPatientMarketplace medications:", medsError.message);
      return empty;
    }

    const meds = [...(rawMeds ?? [])].sort((a: any, b: any) =>
      String(a.name ?? "").localeCompare(String(b.name ?? "")),
    );

    const pharmacyIds = Array.from(new Set(meds.map((m: any) => m.pharmacy_id)));
    if (pharmacyIds.length === 0) return empty;

    const { data: roles, error: rolesError } = await firestoreAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "pharmacy")
      .in("user_id", pharmacyIds);

    if (rolesError) throw new Error(rolesError.message);
    const pharmacyRoleIds = new Set((roles ?? []).map((r) => r.user_id));
    if (pharmacyRoleIds.size === 0) return empty;

    const { data: pharmacies, error: pharmaciesError } = await firestoreAdmin
      .from("profiles")
      .select("user_id, organization_name, full_name, address, phone, latitude, longitude")
      .in("user_id", Array.from(pharmacyRoleIds))
      .eq("approval_status", "approved");

    if (pharmaciesError) throw new Error(pharmaciesError.message);

    const approvedIds = new Set((pharmacies ?? []).map((p) => p.user_id));

    const { data: branches } = await firestoreAdmin
      .from("pharmacy_branches")
      .select("id, pharmacy_id, name, address, latitude, longitude, is_primary, is_active")
      .in("pharmacy_id", Array.from(approvedIds))
      .eq("is_active", true);

    return {
      meds: ((meds ?? []).filter((m) => approvedIds.has(m.pharmacy_id)) as PatientMarketplaceMedication[]),
      pharmacies: (pharmacies ?? []) as PatientMarketplacePharmacy[],
      branches: ((branches ?? []) as any[]).map((b) => ({
        id: b.id, pharmacy_id: b.pharmacy_id, name: b.name, address: b.address,
        latitude: b.latitude, longitude: b.longitude, is_primary: !!b.is_primary,
      })) as PatientMarketplaceBranch[],
    };
  });