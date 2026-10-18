import type { FirebaseAuthUser } from "@/lib/firebase-auth";
import { fsGet, fsList, where } from "@/lib/firestore";
import { registerSelfServiceRole } from "@/lib/role.functions";
import {
  isAppRole,
  roleAfterLookupFailure,
  roleFromRows,
  roleToRepair,
  type AppRole,
} from "./auth-session-policy";

export { isAppRole };
export type { AppRole };

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

const RETRY_DELAYS_MS = [0, 150, 350, 700, 1100, 1600];
const HOMECARE_OPERATIONS_EMAIL = "support@healthreachcare.co.za";

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function dashboardPathForRole(role: AppRole) {
  return role === "homecare_operations" ? "/dashboard/homecare_operations" as const : `/dashboard/${role}` as const;
}

async function readPersistedRole(userId: string): Promise<AppRole | null> {
  const roleRows = await fsList<{ role: unknown }>(
    "user_roles",
    where("user_id", "==", userId),
  );
  return roleFromRows(roleRows.map((row) => row.role));
}

async function repairMissingRole(role: AppRole) {
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
  const repairRole = roleToRepair(options.fallbackRole ?? null);
  let lastReadError: unknown;
  let roleReadFailed = false;
  let repairAttempted = false;

  for (let index = 0; index < attempts; index += 1) {
    const delay = RETRY_DELAYS_MS[index] ?? RETRY_DELAYS_MS.at(-1) ?? 0;
    if (delay > 0) await sleep(delay);

    let persistedRole: AppRole | null;
    try {
      persistedRole = await readPersistedRole(user.uid);
      lastReadError = undefined;
      roleReadFailed = false;
    } catch (error) {
      lastReadError = error;
      roleReadFailed = true;
      continue;
    }
    if (persistedRole) return persistedRole;

    if (index === 2 && options.repairMissing !== false && !repairAttempted) {
      repairAttempted = true;
      try {
        await repairMissingRole(repairRole);
      } catch (error) {
        console.error("[auth] Could not repair the signed-in user's missing role.", error);
      }
    }
  }

  if (roleReadFailed) {
    console.error("[auth] Could not read the signed-in user's Firestore roles.", lastReadError);
    return roleAfterLookupFailure();
  }

  if (options.repairMissing !== false && !repairAttempted) {
    try {
      await repairMissingRole(repairRole);
    } catch (error) {
      console.error("[auth] Could not repair the signed-in user's missing role.", error);
      return roleAfterLookupFailure();
    }
  }

  try {
    return await readPersistedRole(user.uid) ?? roleAfterLookupFailure();
  } catch (error) {
    console.error("[auth] Could not verify the signed-in user's Firestore role.", error);
    return roleAfterLookupFailure();
  }
}

async function resolveProfile(
  user: FirebaseAuthUser,
): Promise<{ profile: ResolvedProfile; approvalStatus: string | null }> {
  try {
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
  } catch (error) {
    console.error("[auth] Could not read the signed-in user's Firestore profile.", error);
    return {
      approvalStatus: null,
      profile: {
        full_name: user.displayName ?? "",
        email: user.email ?? "",
        organization_name: "",
        phone: "",
        address: "",
        is_demo: false,
        avatar_url: user.photoURL ?? "",
      },
    };
  }
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