import type { FirebaseAuthUser } from "@/lib/firebase-auth";
import { fsGet, fsList, fsSet, where } from "@/lib/firestore";

export type AppRole =
  | "patient" | "pharmacy" | "hospital" | "driver" | "admin" | "doctor"
  | "homecare_company" | "homecare_staff";

export interface ResolvedProfile {
  full_name: string;
  email: string;
  organization_name: string;
  phone: string;
  address: string;
  is_demo: boolean;
  avatar_url: string;
}

export interface ResolvedAccount {
  role: AppRole;
  approvalStatus: string | null;
  profile: ResolvedProfile;
}

const APP_ROLES: AppRole[] = [
  "patient", "pharmacy", "hospital", "driver", "admin", "doctor", "homecare_company", "homecare_staff",
];
const SELF_SERVICE_ROLES: AppRole[] = [
  "patient", "pharmacy", "hospital", "driver", "doctor", "homecare_company", "homecare_staff",
];
export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function dashboardPathForRole(role: AppRole) {
  return `/dashboard/${role}` as const;
}

async function readPersistedRole(userId: string): Promise<AppRole | null> {
  const roleRows = await fsList<{ role: unknown }>(
    "user_roles",
    where("user_id", "==", userId),
  );
  const role = roleRows[0]?.role;
  return isAppRole(role) ? role : null;
}

async function repairMissingRole(userId: string, role: AppRole) {
  if (!SELF_SERVICE_ROLES.includes(role)) return;
  await fsSet("user_roles", `${userId}_${role}`, { user_id: userId, role });
}

export async function resolveUserRole(
  user: FirebaseAuthUser,
  options: { fallbackRole?: AppRole | null; repairMissing?: boolean } = {},
): Promise<AppRole> {
  const preferredFallback = options.fallbackRole ?? null;
  const safeFallback = preferredFallback && preferredFallback !== "admin" ? preferredFallback : "patient";

  const persistedRole = await readPersistedRole(user.uid);
  if (persistedRole) return persistedRole;

  if (options.repairMissing !== false) {
    await repairMissingRole(user.uid, safeFallback);
  }

  return safeFallback;
}

async function resolveProfile(
  user: FirebaseAuthUser,
): Promise<{ profile: ResolvedProfile; approvalStatus: string | null }> {
  const data = await fsGet<{
    full_name?: string | null;
    email?: string | null;
    organization_name?: string | null;
    phone?: string | null;
    address?: string | null;
    approval_status?: string | null;
    is_demo?: boolean | null;
    avatar_url?: string | null;
  }>("profiles", user.uid);

  return {
    approvalStatus: data?.approval_status ?? null,
    profile: {
      full_name: data?.full_name || user.displayName || "",
      email: data?.email || user.email || "",
      organization_name: data?.organization_name ?? "",
      phone: data?.phone ?? "",
      address: data?.address ?? "",
      is_demo: !!data?.is_demo,
      avatar_url: data?.avatar_url ?? "",
    },
  };
}

export async function resolveUserAccount(
  user: FirebaseAuthUser,
  fallbackRole?: AppRole | null,
  options: { repairMissing?: boolean } = {},
): Promise<ResolvedAccount> {
  const [role, profileResult] = await Promise.all([
    resolveUserRole(user, { fallbackRole, repairMissing: options.repairMissing }),
    resolveProfile(user),
  ]);

  return {
    role,
    approvalStatus: profileResult.approvalStatus,
    profile: profileResult.profile,
  };
}