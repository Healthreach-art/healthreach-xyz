/**
 * Firestore data layer for HealthReachCare.
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

export async function fsSubscribe<T = DocumentData>(
  col: string,
  constraints: QueryConstraint[],
  callback: (rows: (T & { id: string })[]) => void,
  onError?: (err: Error) => void,
): Promise<Unsubscribe> {
  const q = query(collection(await db(), col), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T & { id: string }));
    },
    (error) => {
      console.warn(`[firestore] snapshot error on ${col}:`, error.message);
      if (onError) onError(error);
    },
  );
}

export { where, orderBy, fsLimit as limit };

export async function getProfile(uid: string) {
  return fsGet("profiles", uid);
}

export async function getUserRoles(uid: string): Promise<Role[]> {
  const rows = await fsList<{ role: Role }>("user_roles", where("user_id", "==", uid));
  return rows.map((r) => r.role);
}

export async function grantRole(uid: string, role: Role) {
  await fsSet("user_roles", `${uid}_${role}`, { user_id: uid, role });
}

export async function getPendingProviders(col: string) {
  return fsList(col, where("status", "==", "pending_review"), orderBy("createdAt", "desc"));
}

export async function setProviderStatus(
  col: string,
  id: string,
  status: ApprovalStatus,
  adminUid: string,
  note?: string,
) {
  await fsUpdate(col, id, { status, reviewedBy: adminUid, reviewNote: note ?? null });
  await fsSet("audit_logs", crypto.randomUUID(), {
    action: `provider_${status}`,
    collection: col,
    targetId: id,
    adminUid,
    note: note ?? null,
    createdAt: serverTimestamp(),
  });
}

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
