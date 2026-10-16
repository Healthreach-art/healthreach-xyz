import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { firestoreAdmin } from "@/lib/firestore-admin";
import { isMedicineExpired } from "@/lib/medicine-catalog";

export interface PatientMarketplaceMedication {
  id: string;
  pharmacy_id: string;
  name: string;
  price: number;
  stock_quantity: number;
  requires_prescription: boolean;
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

const chunksOf = <T,>(values: T[], size: number) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );

export const listPatientMarketplace = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async () => {
<<<<<<< HEAD
    const { data, error } = await firestoreAdmin
      .from("medications_public")
      .select("id, pharmacy_id, name, price, stock_quantity, requires_prescription, image_url, description, category, expiry_date, pharmacy_name, pharmacy_address, pharmacy_phone, latitude, longitude, branch_id, is_active, is_demo")
=======
    // Firestore rejects an inequality filter combined with orderBy on a different
    // field, so filter by stock server-side and sort by name in memory.
    const { data: rawMeds, error: medsError } = await firestoreAdmin
      .from("medications")
      .select("id, pharmacy_id, name, price, stock_quantity, requires_prescription, image_url, description, category, expiry_date, is_demo")
>>>>>>> feat/doctor-homecare-booking
      .gt("stock_quantity", 0);
    if (error) throw new Error(`Could not load the medicine catalogue: ${error.message}`);

<<<<<<< HEAD
    const meds = (data ?? [])
      .filter((medication) =>
        medication.is_active === true
        && medication.is_demo === false
        && typeof medication.name === "string"
        && Number.isFinite(Number(medication.price))
        && Number.isSafeInteger(Number(medication.stock_quantity))
        && Number(medication.stock_quantity) > 0
        && !isMedicineExpired(medication.expiry_date),
      )
      .sort((first, second) =>
        String(first.name ?? "").localeCompare(String(second.name ?? "")),
      ) as Array<PatientMarketplaceMedication & {
      pharmacy_name: string;
      pharmacy_address: string;
      pharmacy_phone: string;
      latitude: number | null;
      longitude: number | null;
      branch_id: string;
    }>;

    const pharmacyIds = Array.from(new Set(meds.map((medication) => medication.pharmacy_id).filter(Boolean)));
    const roleResults = await Promise.all(chunksOf(pharmacyIds, 30).map((ids) =>
      firestoreAdmin.from("user_roles")
        .select("user_id")
        .eq("role", "pharmacy")
        .in("user_id", ids),
    ));
    const profileResults = await Promise.all(chunksOf(pharmacyIds, 30).map((ids) =>
      firestoreAdmin.from("profiles")
        .select("user_id, organization_name, full_name, address, phone, latitude, longitude")
        .eq("approval_status", "approved")
        .in("user_id", ids),
    ));
    const pharmacyResults = await Promise.all(chunksOf(pharmacyIds, 30).map((ids) =>
      firestoreAdmin.from("pharmacies")
        .select("user_id, status")
        .eq("status", "approved")
        .in("user_id", ids),
    ));
    const branchResults = await Promise.all(chunksOf(pharmacyIds, 30).map((ids) =>
      firestoreAdmin.from("pharmacy_branches")
        .select("id, pharmacy_id, name, address, latitude, longitude, is_primary, is_active")
        .eq("is_primary", true)
        .eq("is_active", true)
        .in("pharmacy_id", ids),
    ));
    const queryError = [
      ...roleResults, ...profileResults, ...pharmacyResults, ...branchResults,
    ].find((result) => result.error)?.error;
    if (queryError) throw new Error(`Could not verify marketplace pharmacy eligibility: ${queryError.message}`);

    const roles = roleResults.flatMap((result) => result.data ?? []);
    const profiles = profileResults.flatMap((result) => result.data ?? []);
    const pharmacies = pharmacyResults.flatMap((result) => result.data ?? []);
    const branches = branchResults.flatMap((result) => result.data ?? []);
    const pharmacyRoleIds = new Set(roles.map((role) => role.user_id));
    const approvedPharmacyIds = new Set(
      profiles.filter((profile) => pharmacyRoleIds.has(profile.user_id)
        && pharmacies.some((pharmacy) => pharmacy.user_id === profile.user_id))
        .map((profile) => profile.user_id),
    );
    const activeBranches = branches.filter((branch) => approvedPharmacyIds.has(branch.pharmacy_id));
    const activePharmacyIds = new Set(activeBranches.map((branch) => branch.pharmacy_id));
    const visibleMeds = meds.filter((medication) => activePharmacyIds.has(medication.pharmacy_id));
    const pharmacyMap = new Map<string, PatientMarketplacePharmacy>();
    const branchMap = new Map<string, PatientMarketplaceBranch>();

    for (const profile of profiles) {
      if (!activePharmacyIds.has(profile.user_id)) continue;
      pharmacyMap.set(profile.user_id, {
        user_id: profile.user_id,
        organization_name: profile.organization_name || null,
        full_name: profile.full_name || profile.organization_name || "Pharmacy",
        address: profile.address || null,
        phone: profile.phone || null,
        latitude: profile.latitude ?? null,
        longitude: profile.longitude ?? null,
      });
    }
    for (const branch of activeBranches) {
      if (!branchMap.has(branch.pharmacy_id)) {
        branchMap.set(branch.pharmacy_id, {
          id: branch.id,
          pharmacy_id: branch.pharmacy_id,
          name: branch.name,
          address: branch.address,
          latitude: Number(branch.latitude),
          longitude: Number(branch.longitude),
          is_primary: true,
        });
      }
=======
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
>>>>>>> feat/doctor-homecare-booking
    }

    return {
<<<<<<< HEAD
      meds: visibleMeds as PatientMarketplaceMedication[],
      pharmacies: Array.from(pharmacyMap.values()),
      branches: Array.from(branchMap.values()),
=======
      meds: meds.filter((med) => approvedIds.has(med.pharmacy_id) && openPharmacyIds.has(med.pharmacy_id)) as PatientMarketplaceMedication[],
      pharmacies: ((pharmacies ?? []).filter((pharmacy) => openPharmacyIds.has(pharmacy.user_id)) as PatientMarketplacePharmacy[]),
      branches: ((branches ?? []) as any[]).map((b) => ({
        id: b.id, pharmacy_id: b.pharmacy_id, name: b.name, address: b.address,
        latitude: b.latitude, longitude: b.longitude, is_primary: !!b.is_primary,
      })) as PatientMarketplaceBranch[],
>>>>>>> feat/doctor-homecare-booking
    };
  });
