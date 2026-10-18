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
  pharmacy_address: string | null;
  latitude: number | null;
  longitude: number | null;
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
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_primary: boolean;
}

const chunksOf = <T,>(values: T[], size: number) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );

export const listPatientMarketplace = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async () => {
    const { data: publicData, error: publicError } = await firestoreAdmin
      .from("medications_public")
      .select("id, pharmacy_id, name, price, stock_quantity, requires_prescription, image_url, description, category, expiry_date, pharmacy_name, pharmacy_address, pharmacy_phone, latitude, longitude, branch_id, is_active, is_demo")
      .gt("stock_quantity", 0);
    if (publicError) throw new Error(`Could not load the medicine catalogue: ${publicError.message}`);

    const { data: legacyData, error: legacyError } = await firestoreAdmin
      .from("medications")
      .select("id, pharmacy_id, name, price, stock_quantity, requires_prescription, image_url, description, category, expiry_date, is_active, is_demo")
      .eq("is_active", true)
      .eq("is_demo", false)
      .gt("stock_quantity", 0);
    if (legacyError) throw new Error(`Could not backfill the medicine catalogue: ${legacyError.message}`);

    const publicMeds = publicData ?? [];
    const publicIds = new Set(publicMeds.map((medication) => medication.id).filter(Boolean));
    const allData = [
      ...publicMeds,
      ...(legacyData ?? []).filter((medication) => !publicIds.has(medication.id)),
    ];
    const meds = allData
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
      pharmacy_address: string | null;
      pharmacy_phone: string;
      latitude: number | null;
      longitude: number | null;
      branch_id: string | null;
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
    // Approved pharmacies stay visible whether or not they set up a primary branch.
    const activePharmacyIds = new Set(
      profiles.filter((profile) => pharmacyRoleIds.has(profile.user_id)
        && pharmacies.some((pharmacy) => pharmacy.user_id === profile.user_id))
        .map((profile) => profile.user_id),
    );
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
    const sortedBranches = branches
      .filter((branch) => activePharmacyIds.has(branch.pharmacy_id))
      .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
    for (const branch of sortedBranches) {
      if (!branchMap.has(branch.pharmacy_id)) {
        branchMap.set(branch.pharmacy_id, {
          id: branch.id,
          pharmacy_id: branch.pharmacy_id,
          name: branch.name,
          address: branch.address || null,
          latitude: branch.latitude == null ? null : Number(branch.latitude),
          longitude: branch.longitude == null ? null : Number(branch.longitude),
          is_primary: Boolean(branch.is_primary),
        });
      }
    }
    // Fall back to the pharmacy's own saved address/location when no branch exists.
    for (const pharmacy of pharmacyMap.values()) {
      if (branchMap.has(pharmacy.user_id)) continue;
      branchMap.set(pharmacy.user_id, {
        id: `${pharmacy.user_id}_profile`,
        pharmacy_id: pharmacy.user_id,
        name: pharmacy.organization_name || pharmacy.full_name,
        address: pharmacy.address,
        latitude: pharmacy.latitude == null ? null : Number(pharmacy.latitude),
        longitude: pharmacy.longitude == null ? null : Number(pharmacy.longitude),
        is_primary: true,
      });
    }

    return {
      meds: visibleMeds.map((medication) => {
        const pharmacy = pharmacyMap.get(medication.pharmacy_id);
        const branch = branchMap.get(medication.pharmacy_id);
        return {
          ...medication,
          pharmacy_address: branch?.address || pharmacy?.address || null,
          latitude: branch?.latitude ?? pharmacy?.latitude ?? null,
          longitude: branch?.longitude ?? pharmacy?.longitude ?? null,
        };
      }) as PatientMarketplaceMedication[],
      pharmacies: Array.from(pharmacyMap.values()),
      branches: Array.from(branchMap.values()),
    };
  });
