/**
 * Dual-write sync: mirrors the current backend's profiles and roles into
 * Firestore so the Firebase data layer fills up while the existing system
 * stays the source of truth. Every function here is fire-and-forget safe —
 * sync failures are logged, never thrown, so they can never block sign-up,
 * sign-in, or any existing screen.
 */
import { firebaseSignIn, firebaseSignUp } from "./firebase-auth";
import { fsSet, fsGet } from "./firestore";

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

/**
 * Write the user's profile and role into Firestore (merge — safe to call
 * repeatedly, never duplicates). Role docs use the deterministic id
 * `${uid}_${role}` so re-syncs overwrite instead of duplicating.
 */
export async function syncProfileToFirestore(input: SyncProfileInput): Promise<void> {
  try {
    const existing = await fsGet("profiles", input.uid);
    await fsSet("profiles", input.uid, {
      email: input.email,
      fullName: input.fullName ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      organizationName: input.organizationName ?? null,
      homecareType: input.homecareType ?? null,
      migratedFrom: "supabase",
      ...(existing ? {} : { createdAt: new Date().toISOString() }),
    });
    await fsSet("user_roles", `${input.uid}_${input.role}`, {
      userId: input.uid,
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
        userId: input.uid,
        email: input.email,
        name: input.organizationName || input.fullName || input.email,
        fullName: input.fullName ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        homecareType: input.homecareType ?? null,
        migratedFrom: "supabase",
        ...(existingProvider ? {} : { status: "pending_review", createdAt: new Date().toISOString() }),
      });
    }
  } catch (err) {
    console.warn("[firestore-sync] profile sync failed:", err);
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
    const ownerField = col === "homecare_requests" || col === "orders" ? "customerId" : "patientId";
    const existing = await fsGet(col, id);
    await fsSet(col, id, {
      ...data,
      [ownerField]: fbUser.uid,
      patientEmail: fbUser.email,
      migratedFrom: "supabase",
      ...(existing ? {} : { createdAt: new Date().toISOString() }),
    });
  } catch (err) {
    console.warn(`[firestore-sync] ${col} mirror failed:`, err);
  }
}
