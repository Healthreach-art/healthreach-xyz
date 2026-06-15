import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "patient" | "pharmacy" | "hospital" | "driver" | "admin" | "doctor";

export interface ResolvedProfile {
  full_name: string;
  email: string;
  organization_name: string;
  phone: string;
  address: string;
  is_demo: boolean;
}

export interface ResolvedAccount {
  role: AppRole;
  approvalStatus: string | null;
  profile: ResolvedProfile;
}

const APP_ROLES: AppRole[] = ["patient", "pharmacy", "hospital", "driver", "admin", "doctor"];
const SELF_SERVICE_ROLES: AppRole[] = ["patient", "pharmacy", "hospital", "driver", "doctor"];
const RETRY_DELAYS_MS = [0, 150, 350, 700, 1100, 1600];

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function dashboardPathForRole(role: AppRole) {
  return `/dashboard/${role}` as const;
}

export function metadataRole(user: User): AppRole | null {
  const role = user.user_metadata?.role;
  return isAppRole(role) ? role : null;
}

async function readPersistedRole(userId: string): Promise<AppRole | null> {
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  return isAppRole(roleRow?.role) ? roleRow.role : null;
}

async function repairMissingRole(userId: string, role: AppRole) {
  if (!SELF_SERVICE_ROLES.includes(role)) return;
  await supabase.from("user_roles").upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
}

export async function resolveUserRole(
  user: User,
  options: { attempts?: number; fallbackRole?: AppRole | null; repairMissing?: boolean } = {},
): Promise<AppRole> {
  const attempts = options.attempts ?? RETRY_DELAYS_MS.length;
  const preferredFallback = options.fallbackRole ?? metadataRole(user);
  const safeFallback = preferredFallback && preferredFallback !== "admin" ? preferredFallback : "patient";

  for (let index = 0; index < attempts; index += 1) {
    const delay = RETRY_DELAYS_MS[index] ?? RETRY_DELAYS_MS.at(-1) ?? 0;
    if (delay > 0) await sleep(delay);

    const persistedRole = await readPersistedRole(user.id);
    if (persistedRole) return persistedRole;

    if (index === 2 && options.repairMissing !== false) {
      await repairMissingRole(user.id, safeFallback);
    }
  }

  if (options.repairMissing !== false) {
    await repairMissingRole(user.id, safeFallback);
    const repairedRole = await readPersistedRole(user.id);
    if (repairedRole) return repairedRole;
  }

  return safeFallback;
}

async function resolveProfile(user: User): Promise<{ profile: ResolvedProfile; approvalStatus: string | null }> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email, organization_name, phone, address, approval_status, is_demo")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    approvalStatus: data?.approval_status ?? null,
    profile: {
      full_name: data?.full_name || user.user_metadata?.full_name || "",
      email: data?.email || user.email || "",
      organization_name: data?.organization_name ?? "",
      phone: data?.phone ?? "",
      address: data?.address ?? "",
      is_demo: !!data?.is_demo,
    },
  };
}

export async function resolveUserAccount(user: User, fallbackRole?: AppRole | null): Promise<ResolvedAccount> {
  const [role, profileResult] = await Promise.all([
    resolveUserRole(user, { fallbackRole }),
    resolveProfile(user),
  ]);

  return {
    role,
    approvalStatus: profileResult.approvalStatus,
    profile: profileResult.profile,
  };
}