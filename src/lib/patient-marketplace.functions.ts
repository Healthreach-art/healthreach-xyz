import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async () => {
    const empty = {
      meds: [] as PatientMarketplaceMedication[],
      pharmacies: [] as PatientMarketplacePharmacy[],
      branches: [] as PatientMarketplaceBranch[],
    };

    const { data: meds, error: medsError } = await supabaseAdmin
      .from("medications")
      .select("id, pharmacy_id, name, price, stock_quantity, requires_prescription, image_url, description, category")
      .gt("stock_quantity", 0)
      .order("name", { ascending: true });

    if (medsError) throw new Error(medsError.message);

    const pharmacyIds = Array.from(new Set((meds ?? []).map((m) => m.pharmacy_id)));
    if (pharmacyIds.length === 0) return empty;

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "pharmacy")
      .in("user_id", pharmacyIds);

    if (rolesError) throw new Error(rolesError.message);
    const pharmacyRoleIds = new Set((roles ?? []).map((r) => r.user_id));
    if (pharmacyRoleIds.size === 0) return empty;

    const { data: pharmacies, error: pharmaciesError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, organization_name, full_name, address, phone, latitude, longitude")
      .in("user_id", Array.from(pharmacyRoleIds))
      .eq("approval_status", "approved");

    if (pharmaciesError) throw new Error(pharmaciesError.message);

    const approvedIds = new Set((pharmacies ?? []).map((p) => p.user_id));

    const { data: branches } = await supabaseAdmin
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