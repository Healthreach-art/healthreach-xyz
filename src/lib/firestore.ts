/**
 * Firestore data layer for HealthReachCare.
 *
 * Firestore data access for HealthReachCare.
 *
 * Collection layout (top-level unless noted):
 *   profiles/{uid}                  — one per user, mirrors public.profiles
 *   user_roles/{uid_role}           — role rows, mirrors public.user_roles
 *   doctors/{uid}                   — doctor professional profiles
 *   pharmacies/{id}                 — pharmacy profiles
 *   drivers/{uid}                   — driver profiles
 *   homecare_providers/{id}         — home care companies & individuals
 *   homecare_staff/{id}             — company staff members
 *   orders/{id}                     — medicine orders (deliveries merged in)
 *   bookings/{id}                   — doctor & homecare appointments
 *   homecare_requests/{id}          — customer home care requests
 *   homecare_assignments/{id}       — admin assignments to providers
 *   notifications/{id}              — in-app notifications
 *   audit_logs/{id}                 — admin action audit trail
 *   documents/{id}                  — document metadata (files live in Storage)
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  onSnapshot,
  serverTimestamp,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./firebase";

export type Role =
  | "patient"
  | "doctor"
  | "pharmacy"
  | "driver"
  | "hospital"
  | "admin"
  | "homecare_company"
  | "homecare_staff";

export type ApprovalStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "documents_requested"
  | "suspended";

async function db() {
  const { db } = await getFirebase();
  return db;
}

// ---------- Generic helpers ----------

export async function fsGet<T = DocumentData>(
  col: string,
  id: string,
): Promise<(T & { id: string }) | null> {
  const snap = await getDoc(doc(await db(), col, id));
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as T & { id: string }) : null;
}

export async function fsList<T = DocumentData>(
  col: string,
  ...constraints: QueryConstraint[]
): Promise<(T & { id: string })[]> {
  const q = query(collection(await db(), col), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T & { id: string });
}

export async function fsSet(
  col: string,
  id: string,
  data: Record<string, unknown>,
  merge = true,
): Promise<void> {
  await setDoc(doc(await db(), col, id), data, { merge });
}

export async function fsUpdate(
  col: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await updateDoc(doc(await db(), col, id), data);
}

export async function fsDelete(col: string, id: string): Promise<void> {
  await deleteDoc(doc(await db(), col, id));
}

/** Realtime listener on a Firestore collection query. */
export async function fsSubscribe<T = DocumentData>(
  col: string,
  constraints: QueryConstraint[],
  callback: (rows: (T & { id: string })[]) => void,
): Promise<Unsubscribe> {
  const q = query(collection(await db(), col), ...constraints);
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T & { id: string })),
  );
}

// ---------- Query constraint re-exports (so screens import from one place) ----------
export { where, orderBy, fsLimit as limit };

// ---------- Domain helpers ----------

/** Fetch a user's profile. */
export async function getProfile(uid: string) {
  return fsGet("profiles", uid);
}

/** Fetch all roles for a user. */
export async function getUserRoles(uid: string): Promise<Role[]> {
  const rows = await fsList<{ role: Role }>("user_roles", where("user_id", "==", uid));
  return rows.map((r) => r.role);
}

/** Grant a role (admin only — enforced by security rules). */
export async function grantRole(uid: string, role: Role) {
  await fsSet("user_roles", `${uid}_${role}`, { user_id: uid, role });
}

/** List providers awaiting admin review, newest first. */
export async function getPendingProviders(col: string) {
  return fsList(col, where("status", "==", "pending_review"), orderBy("createdAt", "desc"));
}

/** Approve / reject / request documents / suspend — writes audit trail. */
export async function setProviderStatus(
  col: string,
  id: string,
  status: ApprovalStatus,
  adminUid: string,
  note?: string,
) {
  const approved = status === "approved";
  // Merge-write so provider docs that only existed in profiles get created.
  await fsSet(col, id, {
    id, user_id: id, status, approval_status: status, reviewedBy: adminUid, reviewNote: note ?? null,
    ...(col === "doctors" || col === "homecare_providers" ? { is_verified: approved, is_active: approved } : {}),
  });
  // Patient discovery reads profiles.approval_status — keep it in sync.
  await fsSet("profiles", id, { approval_status: status, is_verified: approved });
  await fsSet("audit_logs", crypto.randomUUID(), {
    action: `provider_${status}`,
    collection: col,
    targetId: id,
    adminUid,
    note: note ?? null,
    createdAt: serverTimestamp(),
  });
}

/** Create an in-app notification for a user. */
export async function notify(
  userId: string,
  title: string,
  body: string,
  link?: string,
) {
  await fsSet("notifications", crypto.randomUUID(), {
    userId,
    title,
    body,
    link: link ?? null,
    read: false,
    createdAt: serverTimestamp(),
  });
}
