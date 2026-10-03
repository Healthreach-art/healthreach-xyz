/**
 * Private document uploads on Firebase Storage (prescriptions, IDs, licences).
 * Files live at documents/{uid}/{kind}/{timestamp}-{name}; metadata in the
 * Firestore `documents` collection with status pending_review. Access is via
 * short-lived download URLs only for the owner and admins (see storage.rules).
 * Requires Firebase Storage to be enabled (Blaze plan).
 */
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirebase } from "./firebase";
import { fsSet } from "./firestore";

export type DocumentKind = "prescription" | "id_document" | "licence" | "qualification" | "other";
const MAX = 10 * 1024 * 1024;

export async function uploadPrivateDocument(file: File, kind: DocumentKind) {
  if (file.size > MAX) throw new Error("File is larger than 10 MB.");
  if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
    throw new Error("Only PDF or image files are allowed.");
  }
  const { auth, storage } = await getFirebase();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in first.");
  const id = crypto.randomUUID();
  const path = `documents/${user.uid}/${kind}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  await uploadBytes(ref(storage, path), file, { contentType: file.type });
  await fsSet("documents", id, {
    userId: user.uid, kind, path, fileName: file.name, contentType: file.type,
    size: file.size, status: "pending_review", createdAt: new Date().toISOString(),
  });
  return { id, path };
}

/** Owner or admin only — enforced by storage rules. */
export async function getDocumentUrl(path: string) {
  const { storage } = await getFirebase();
  return getDownloadURL(ref(storage, path));
}
