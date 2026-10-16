/** Persist Firebase account profiles and roles in Firestore. */
import { firebaseSignIn, firebaseSignUp } from "./firebase-auth";
import { fsSet, fsGet, fsList, where } from "./firestore";

/**
 * Make sure the user also has a Firebase Auth session, creating the
 * Firebase account on first use with the same email/password.
 */
export async function ensureFirebaseSession(
  email: string,
  password: string,
  displayName?: string,
): Promise<string | null> {
  try {
    const user = await firebaseSignIn(email, password);
    return user.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? "";
    if (
      code === "auth/user-not-found" ||
      code === "auth/invalid-credential" ||
      code === "auth/invalid-login-credentials"
    ) {
      try {
        const user = await firebaseSignUp(email, password, displayName);
        return user.uid;
      } catch (signUpErr) {
        console.warn("[firestore-sync] Firebase account creation failed:", signUpErr);
        return null;
      }
    }
    console.warn("[firestore-sync] Firebase sign-in failed:", err);
    return null;
  }
}

export type SyncProfileInput = {
  uid: string;
  email: string;
  fullName?: string;
  role: string;
  phone?: string;
  address?: string;
  lat?: number;
  lng?: number;
  organizationName?: string;
  homecareType?: string;
};

export async function ensurePrimaryPharmacyBranch(input: {
  pharmacyId: string;
  name: string;
  address: string;
  phone?: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  const branches = await fsList<Record<string, unknown>>(
    "pharmacy_branches",
    where("pharmacy_id", "==", input.pharmacyId),
  );
  const primary = branches.find((branch) => branch.is_primary) ?? branches[0];
  const id = primary?.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  await fsSet("pharmacy_branches", id, {
    pharmacy_id: input.pharmacyId,
    name: input.name,
    address: input.address,
    phone: input.phone ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    is_primary: true,
    is_active: primary?.is_active ?? true,
    service_radius_km: primary?.service_radius_km ?? 20,
    created_at: primary?.created_at ?? now,
    updated_at: now,
  });
}

/**
 * Write the user's profile and role into Firestore (merge — safe to call
 * repeatedly, never duplicates). Role docs use the deterministic id
 * `${uid}_${role}` so re-syncs overwrite instead of duplicating.
 */
export async function syncProfileToFirestore(input: SyncProfileInput): Promise<void> {
  try {
    const existing = await fsGet("profiles", input.uid);
    await fsSet("profiles", input.uid, {
      id: input.uid,
      user_id: input.uid,
      email: input.email,
      full_name: input.fullName ?? existing?.full_name ?? null,
      phone: input.phone ?? existing?.phone ?? null,
      address: input.address ?? existing?.address ?? null,
      latitude: input.lat ?? existing?.latitude ?? null,
      longitude: input.lng ?? existing?.longitude ?? null,
      ...(input.role !== "patient"
        ? { approval_status: existing?.approval_status ?? "pending" }
        : {}),
      organization_name: input.organizationName ?? existing?.organization_name ?? null,
      homecare_type: input.homecareType ?? existing?.homecare_type ?? null,
      ...(existing ? {} : { created_at: new Date().toISOString() }),
    });
    await fsSet("user_roles", `${input.uid}_${input.role}`, {
      id: `${input.uid}_${input.role}`,
      user_id: input.uid,
      role: input.role,
    });
    // Mirror provider records (status starts pending; admin approves).
    const providerCol: Record<string, string> = {
      doctor: "doctors",
      pharmacy: "pharmacies",
      driver: "drivers",
      homecare_company: "homecare_providers",
      homecare_individual: "homecare_providers",
    };
    const col = providerCol[input.role];
    if (col) {
      const existingProvider = await fsGet(col, input.uid);
      await fsSet(col, input.uid, {
        id: input.uid,
        user_id: input.uid,
        email: input.email,
        organization_name: input.organizationName ?? existingProvider?.organization_name ?? null,
        full_name: input.fullName ?? existingProvider?.full_name ?? null,
        phone: input.phone ?? existingProvider?.phone ?? null,
        address: input.address ?? existingProvider?.address ?? null,
        latitude: input.lat ?? existingProvider?.latitude ?? null,
        longitude: input.lng ?? existingProvider?.longitude ?? null,
        approval_status: existingProvider?.approval_status ?? "pending",
        homecare_type: input.homecareType ?? null,
        status: existingProvider?.status ?? existingProvider?.approval_status ?? "pending_review",
        ...(input.role === "doctor" ? { is_verified: existingProvider?.is_verified ?? false } : {}),
        ...(existingProvider ? {} : { created_at: new Date().toISOString() }),
      });
    }
    if (input.role === "pharmacy" && input.address && input.lat != null && input.lng != null) {
      await ensurePrimaryPharmacyBranch({
        pharmacyId: input.uid,
        name: input.organizationName || input.fullName || "Pharmacy",
        address: input.address,
        phone: input.phone,
        latitude: input.lat,
        longitude: input.lng,
      });
    }
    // Pharmacies need a primary branch with real GPS for patient distance search.
    if (input.role === "pharmacy" && input.address && input.lat != null && input.lng != null) {
      const branchId = `${input.uid}_primary`;
      const existingBranch = await fsGet("pharmacy_branches", branchId);
      await fsSet("pharmacy_branches", branchId, {
        id: branchId,
        pharmacy_id: input.uid,
        name: input.organizationName || "Main branch",
        address: input.address,
        latitude: input.lat,
        longitude: input.lng,
        is_primary: true,
        is_active: true,
        service_radius_km: 60,
        ...(existingBranch ? {} : { created_at: new Date().toISOString() }),
      });
    }
  } catch (err) {
    console.warn("[firestore-sync] profile sync failed:", err);
    throw err;
  }
}

/**
 * Full post-auth sync: ensure a Firebase session exists, then mirror the
 * profile and role. Call after successful sign-up or sign-in.
 */
export async function syncAfterAuth(
  email: string,
  password: string,
  profile: Omit<SyncProfileInput, "uid">,
): Promise<void> {
  const uid = await ensureFirebaseSession(email, password, profile.fullName);
  if (!uid) return;
  await syncProfileToFirestore({ ...profile, uid });
}

/**
 * Mirror a booking / request / payment into Firestore so the admin centre
 * sees it live. Uses the same id as the existing record (no duplicates).
 * Fire-and-forget: never blocks the existing flow.
 */
export async function mirrorRecord(
  col: "bookings" | "homecare_requests" | "payments" | "orders",
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const { getFirebaseCurrentUser } = await import("./firebase-auth");
    const fbUser = await getFirebaseCurrentUser();
    if (!fbUser) return;
    const ownerField = "patient_id";
    const existing = await fsGet(col, id);
    await fsSet(col, id, {
      ...data,
      [ownerField]: fbUser.uid,
      patient_email: fbUser.email,
      ...(existing ? {} : { created_at: new Date().toISOString() }),
    });
  } catch (err) {
    console.warn(`[firestore-sync] ${col} mirror failed:`, err);
  }
}

/**
 * Google sign-in through Firebase. Creates the Firestore profile + role on
 * first use and returns where the user should be sent.
 */
export async function firebaseGoogleSignIn(defaultRole: string): Promise<string> {
  const { firebaseSignInWithGoogle } = await import("./firebase-auth");
  const { getUserRoles } = await import("./firestore");
  const user = await firebaseSignInWithGoogle();
  if (!user.emailVerified) return "/auth/verify-email";

  const email = (user.email ?? "").toLowerCase();
  let roles: string[] = await getUserRoles(user.uid).then((r) => (r as unknown as string[]) ?? []).catch((): string[] => []);
  if (!Array.isArray(roles)) roles = [];
  if (roles.length === 0) {
    const role = email === "admin@healthreachcare.co.za" ? "admin" : defaultRole;
    await syncProfileToFirestore({ uid: user.uid, email, fullName: user.displayName ?? undefined, role }).catch(() => {});
    roles = [role];
  }
  if (roles.includes("admin") || email === "admin@healthreachcare.co.za") return "/firebase-admin";
  const { dashboardPathForRole } = await import("./auth-session");
  return dashboardPathForRole(roles[0] as Parameters<typeof dashboardPathForRole>[0]);
}
