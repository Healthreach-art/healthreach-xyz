/**
 * Private document uploads on Cloudflare R2 (prescriptions, IDs, licences).
 * Files live at documents/{uid}/{kind}/{timestamp}-{name}; metadata in the
 * Firestore `documents` collection with status pending_review. Access is via
 * short-lived, authorization-checked download links.
 */
import { firestoreClient } from "./firestore-client";
import { fsSet } from "./firestore";

export type DocumentKind = "prescription" | "id_document" | "licence" | "qualification" | "other";
const MAX = 10 * 1024 * 1024;

export async function uploadPrivateDocument(file: File, kind: DocumentKind) {
  if (file.size > MAX) throw new Error("File is larger than 10 MB.");
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
    throw new Error("Only PDF, JPEG, PNG, or WEBP files are allowed.");
  }
  const { data: { user }, error: authError } = await firestoreClient.auth.getUser();
  if (authError || !user) throw authError ?? new Error("Please sign in first.");
  const id = crypto.randomUUID();
  const objectPath = `${user.id}/${kind}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const path = `documents/${objectPath}`;
  const { error } = await firestoreClient.storage.from("documents").upload(objectPath, file, {
    contentType: file.type,
  });
  if (error) throw error;
  await fsSet("documents", id, {
    user_id: user.id, kind, path, fileName: file.name, contentType: file.type,
    size: file.size, status: "pending_review", createdAt: new Date().toISOString(),
  });
  return { id, path };
}

/** Owner or admin only — enforced by the authenticated Worker endpoint. */
export async function getDocumentUrl(path: string) {
  const objectPath = path.startsWith("documents/") ? path.slice("documents/".length) : path;
  const { data, error } = await firestoreClient.storage.from("documents").createSignedUrl(objectPath, 300);
  if (error) throw error;
  return data.signedUrl;
}
