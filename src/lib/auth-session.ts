import type { FirebaseAuthUser } from "@/lib/firebase-auth";
import { fsGet, fsList, where } from "@/lib/firestore";
import { registerSelfServiceRole } from "@/lib/role.functions";

export type AppRole =
  | "patient" | "pharmacy" | "hospital" | "driver" | "admin" | "doctor"
  | "homecare_company" | "homecare_staff" | "homecare_operations";

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
  "homecare_operations",
];
const SELF_SERVICE_ROLES: AppRole[] = [
  "patient", "pharmacy", "hospital", "driver", "doctor", "homecare_company", "homecare_staff",
];
const RETRY_DELAYS_MS = [0, 150, 350, 700, 1100, 1600];
const HOMECARE_OPERATIONS_EMAIL = "support@healthreachcare.co.za";

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function dashboardPathForRole(role: AppRole) {
  return role === "homecare_operations" ? "/dashboard/homecare_operations" as const : `/dashboard/${role}` as const;
}

async function readPersistedRole(userId: string): Promise<AppRole | null> {
  const roleRows = await fsList<{ role: unknown }>(
    "user_roles",
    where("user_id", "==", userId),
  );
  const roles = roleRows.map((row) => row.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("homecare_operations")) return "homecare_operations";
  const role = roles[0];
  return isAppRole(role) ? role : null;
}

async function repairMissingRole(role: AppRole) {
  if (!SELF_SERVICE_ROLES.includes(role)) return;
  await registerSelfServiceRole({ data: { role } });
}

export async function resolveUserRole(
  user: FirebaseAuthUser,
  options: { attempts?: number; fallbackRole?: AppRole | null; repairMissing?: boolean } = {},
): Promise<AppRole> {
  if (user.email?.trim().toLowerCase() === HOMECARE_OPERATIONS_EMAIL) {
    if (!user.emailVerified) return "patient";
    await registerSelfServiceRole({ data: { role: "homecare_operations" } });
    return "homecare_operations";
  }

  const attempts = options.attempts ?? RETRY_DELAYS_MS.length;
  const preferredFallback = options.fallbackRole ?? null;
  const safeFallback = preferredFallback && preferredFallback !== "admin" ? preferredFallback : "patient";

  for (let index = 0; index < attempts; index += 1) {
    const delay = RETRY_DELAYS_MS[index] ?? RETRY_DELAYS_MS.at(-1) ?? 0;
    if (delay > 0) await sleep(delay);

    const persistedRole = await readPersistedRole(user.uid);
    if (persistedRole) return persistedRole;

    if (index === 2 && options.repairMissing !== false) {
      await repairMissingRole(safeFallback);
    }
  }

  if (options.repairMissing !== false) {
    await repairMissingRole(safeFallback);
    const repairedRole = await readPersistedRole(user.uid);
    if (repairedRole) return repairedRole;
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
): Promise<ResolvedAccount> {
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