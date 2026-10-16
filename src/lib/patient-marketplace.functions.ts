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
  expiry_date?: string | null;
  is_demo?: boolean;
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
    // Firestore rejects an inequality filter combined with orderBy on a different
    // field, so filter by stock server-side and sort by name in memory.
    const { data: rawMeds, error: medsError } = await firestoreAdmin
      .from("medications")
      .select("id, pharmacy_id, name, price, stock_quantity, requires_prescription, image_url, description, category, expiry_date, is_demo")
      .gt("stock_quantity", 0);

    if (medsError) throw new Error(`Could not load marketplace medicines: ${medsError.message}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const meds = (rawMeds ?? []).filter((med) => {
      const price = Number(med.price);
      const stock = Number(med.stock_quantity);
      const expiry = med.expiry_date ? new Date(med.expiry_date).getTime() : null;
      return med.is_demo !== true
        && typeof med.id === "string" && !!med.id
        && typeof med.pharmacy_id === "string" && !!med.pharmacy_id
        && typeof med.name === "string" && !!med.name.trim()
        && Number.isFinite(price) && price > 0
        && Number.isInteger(stock) && stock > 0
        && (expiry === null || Number.isFinite(expiry) && expiry >= today.getTime());
    }).sort((first, second) => first.name.localeCompare(second.name));

    const pharmacyIds = Array.from(new Set(meds.map((med) => med.pharmacy_id)));
    if (pharmacyIds.length === 0) return { meds: [], pharmacies: [], branches: [] };

    const { data: roles, error: rolesError } = await firestoreAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "pharmacy")
      .in("user_id", pharmacyIds);

    if (rolesError) throw new Error(`Could not verify marketplace pharmacies: ${rolesError.message}`);
    const pharmacyRoleIds = new Set((roles ?? []).map((r) => r.user_id));
    if (pharmacyRoleIds.size === 0) return { meds: [], pharmacies: [], branches: [] };

    const { data: pharmacies, error: pharmaciesError } = await firestoreAdmin
      .from("profiles")
      .select("user_id, organization_name, full_name, address, phone, latitude, longitude")
      .in("user_id", Array.from(pharmacyRoleIds))
      .eq("approval_status", "approved");

    if (pharmaciesError) throw new Error(`Could not load approved pharmacies: ${pharmaciesError.message}`);

    const approvedIds = new Set((pharmacies ?? []).map((p) => p.user_id));

    const { data: branches, error: branchesError } = await firestoreAdmin
      .from("pharmacy_branches")
      .select("id, pharmacy_id, name, address, latitude, longitude, is_primary, is_active")
      .in("pharmacy_id", Array.from(approvedIds))
      .eq("is_primary", true)
      .eq("is_active", true);
    if (branchesError) {
      throw new Error(`Could not load active pharmacy branches: ${branchesError.message}`);
    }

    const openPharmacyIds = new Set((branches ?? []).map((branch) => branch.pharmacy_id));
    return {
      meds: meds.filter((med) => approvedIds.has(med.pharmacy_id) && openPharmacyIds.has(med.pharmacy_id)) as PatientMarketplaceMedication[],
      pharmacies: ((pharmacies ?? []).filter((pharmacy) => openPharmacyIds.has(pharmacy.user_id)) as PatientMarketplacePharmacy[]),
      branches: ((branches ?? []) as any[]).map((b) => ({
        id: b.id, pharmacy_id: b.pharmacy_id, name: b.name, address: b.address,
        latitude: b.latitude, longitude: b.longitude, is_primary: !!b.is_primary,
      })) as PatientMarketplaceBranch[],
    };
  });