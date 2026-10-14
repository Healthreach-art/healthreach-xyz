type WorkerEnv = Partial<(typeof import("cloudflare:workers"))["env"]>;

// Loaded lazily: "cloudflare:workers" exists only in the Worker runtime, not the Node dev server.
async function getEnv(): Promise<WorkerEnv> {
  try {
    const id = "cloudflare:workers";
    const mod = (await import(/* @vite-ignore */ id)) as { env: WorkerEnv };
    return mod.env ?? {};
  } catch {
    return { R2_URL_SIGNING_SECRET: process.env.R2_URL_SIGNING_SECRET };
  }
}
import { verifyFirebaseIdToken } from "./firebase-auth-middleware";

const FIRESTORE_DOCUMENTS =
  "https://firestore.googleapis.com/v1/projects/healthreachcare-prod/databases/(default)/documents";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_URL_TTL_SECONDS = 15 * 60;
const PRIVATE_BUCKETS = new Set([
  "documents",
  "prescriptions",
  "pharmacy-docs",
  "doctor-docs",
  "driver-docs",
  "homecare-docs",
  "delivery-proofs",
]);
const REQUIRED_ROLE: Record<string, string> = {
  "pharmacy-docs": "pharmacy",
  "doctor-docs": "doctor",
  "driver-docs": "driver",
  "homecare-docs": "homecare_company",
  "delivery-proofs": "driver",
};
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type PrivateFileIdentity = {
  userId: string;
  email: string | null;
  authorization: string;
};

function invalid(status: number, message: string) {
  return new Response(message, { status });
}

function parseObjectPath(value: string): string | null {
  if (
    value.length > 1024 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    }) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    return null;
  }
  return value;
}

function isPrivateBucket(bucket: string): boolean {
  return PRIVATE_BUCKETS.has(bucket);
}

function isOwnerPath(bucket: string, path: string, userId: string): boolean {
  const parts = path.split("/");
  const ownerPath = bucket === "documents" && parts[0] === "documents"
    ? parts.slice(1)
    : parts;
  return ownerPath.length >= 2 && ownerPath[0] === userId;
}

function firestoreAuthorization(token: string): string {
  return `Bearer ${token}`;
}

async function getIdentity(request: Request): Promise<PrivateFileIdentity | Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    await request.body?.cancel();
    return invalid(401, "A Firebase ID token is required.");
  }

  try {
    const { userId, claims } = await verifyFirebaseIdToken(match[1]);
    return {
      userId,
      email: typeof claims.email === "string" ? claims.email : null,
      authorization: firestoreAuthorization(match[1]),
    };
  } catch (error) {
    await request.body?.cancel();
    if (error instanceof Response) return error;
    throw error;
  }
}

async function hasRole(identity: PrivateFileIdentity, role: string): Promise<boolean> {
  const documentId = `${identity.userId}_${role}`;
  const response = await fetch(
    `${FIRESTORE_DOCUMENTS}/user_roles/${encodeURIComponent(documentId)}`,
    { headers: { Authorization: identity.authorization } },
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Could not verify the ${role} role (${response.status}).`);
  }
  const body = await response.json() as {
    fields?: { role?: { stringValue?: string }; user_id?: { stringValue?: string } };
  };
  return body.fields?.role?.stringValue === role &&
    body.fields.user_id?.stringValue === identity.userId;
}

async function isAdmin(identity: PrivateFileIdentity): Promise<boolean> {
  return identity.email?.toLowerCase() === "admin@healthreachcare.co.za" ||
    hasRole(identity, "admin");
}

async function queryDocuments(
  identity: PrivateFileIdentity,
  collection: string,
  filters: Array<{ field: string; value: string }>,
): Promise<Array<{ fields?: Record<string, { stringValue?: string }> }>> {
  const clauses = filters.map(({ field, value }) => ({
    fieldFilter: {
      field: { fieldPath: field },
      op: "EQUAL",
      value: { stringValue: value },
    },
  }));
  const response = await fetch(`${FIRESTORE_DOCUMENTS}:runQuery`, {
    method: "POST",
    headers: {
      Authorization: identity.authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: clauses.length === 1
          ? clauses[0]
          : { compositeFilter: { op: "AND", filters: clauses } },
        limit: 1,
      },
    }),
  });
  if (response.status === 403) return [];
  if (!response.ok) {
    throw new Error(`Could not verify private document access (${response.status}).`);
  }
  const rows = await response.json() as Array<{
    document?: { fields?: Record<string, { stringValue?: string }> };
  }>;
  return rows.flatMap((row) => row.document ? [row.document] : []);
}

async function pharmacyOwnsPrescription(
  identity: PrivateFileIdentity,
  path: string,
): Promise<boolean> {
  if (!await hasRole(identity, "pharmacy")) return false;
  const rows = await queryDocuments(identity, "prescription_uploads", [
    { field: "file_path", value: path },
    { field: "pharmacy_id", value: identity.userId },
  ]);
  return rows.length > 0;
}

async function homecareMemberOwnsDocument(
  identity: PrivateFileIdentity,
  path: string,
): Promise<boolean> {
  if (!await hasRole(identity, "homecare_staff")) return false;
  const documents = await queryDocuments(identity, "homecare_documents", [
    { field: "file_path", value: path },
  ]);
  const providerId = documents[0]?.fields?.provider_id?.stringValue;
  if (!providerId) return false;
  const membership = await queryDocuments(identity, "homecare_staff", [
    { field: "company_id", value: providerId },
    { field: "user_id", value: identity.userId },
  ]);
  return membership.length > 0;
}

async function canAccess(
  identity: PrivateFileIdentity,
  bucket: string,
  path: string,
): Promise<boolean> {
  if (await isAdmin(identity)) return true;
  if (isOwnerPath(bucket, path, identity.userId)) {
    const requiredRole = REQUIRED_ROLE[bucket];
    return !requiredRole || hasRole(identity, requiredRole);
  }
  if (bucket === "prescriptions") {
    return pharmacyOwnsPrescription(identity, path);
  }
  if (bucket === "homecare-docs") {
    return homecareMemberOwnsDocument(identity, path);
  }
  return false;
}

async function getSigningSecret(): Promise<string> {
  const env = await getEnv();
  const secret = env.R2_URL_SIGNING_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error("R2_URL_SIGNING_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

async function signatureFor(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(await getSigningSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function isValidSignature(message: string, signature: string): Promise<boolean> {
  let bytes: Uint8Array;
  try {
    const base64 = signature.replace(/-/g, "+").replace(/_/g, "/");
    bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return false;
  }
  if (bytes.length !== 32) return false;
  const signatureBytes = new ArrayBuffer(bytes.length);
  new Uint8Array(signatureBytes).set(bytes);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(await getSigningSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(message),
  );
}

function linkMessage(bucket: string, path: string, expires: number): string {
  return `${bucket}\n${path}\n${expires}`;
}

async function createSignedUrl(
  requestUrl: string,
  bucket: string,
  path: string,
  expiresIn: number,
): Promise<string> {
  const documentsBucket = (await getEnv()).DOCUMENTS_BUCKET;
  if (!documentsBucket) {
    throw new Error("The private documents R2 bucket is not bound to this Worker.");
  }
  const exists = await documentsBucket.get(`${bucket}/${path}`);
  if (!exists) throw new Error("Private file not found.");
  const ttl = Math.max(1, Math.min(Math.floor(expiresIn), MAX_URL_TTL_SECONDS));
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const signature = await signatureFor(linkMessage(bucket, path, expires));
  const signedUrl = new URL("/api/private-files", requestUrl);
  signedUrl.searchParams.set("bucket", bucket);
  signedUrl.searchParams.set("path", path);
  signedUrl.searchParams.set("expires", String(expires));
  signedUrl.searchParams.set("signature", signature);
  return signedUrl.toString();
}

export async function createAuthorizedPrivateFileUrl(
  identity: PrivateFileIdentity,
  requestUrl: string,
  bucket: string,
  rawPath: string,
  expiresIn: number,
): Promise<string> {
  const path = parseObjectPath(rawPath);
  if (!isPrivateBucket(bucket) || !path) {
    throw new Error("Invalid private file bucket or path.");
  }
  if (!await canAccess(identity, bucket, path)) {
    throw new Response("You are not authorized to access this private file.", { status: 403 });
  }
  return createSignedUrl(requestUrl, bucket, path, expiresIn);
}

export async function handlePrivateFileRequest(request: Request): Promise<Response> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const bucket = url.searchParams.get("bucket") ?? "";
    const path = parseObjectPath(url.searchParams.get("path") ?? "");
    const expires = Number(url.searchParams.get("expires"));
    const signature = url.searchParams.get("signature") ?? "";
    const now = Math.floor(Date.now() / 1000);
    if (
      !isPrivateBucket(bucket) ||
      !path ||
      !Number.isSafeInteger(expires) ||
      expires <= now ||
      expires > now + MAX_URL_TTL_SECONDS ||
      !signature
    ) {
      return invalid(403, "This private file link is invalid or expired.");
    }
    if (!await isValidSignature(linkMessage(bucket, path, expires), signature)) {
      return invalid(403, "This private file link is invalid or expired.");
    }

    const documentsBucket = (await getEnv()).DOCUMENTS_BUCKET;
    if (!documentsBucket) {
      return invalid(503, "The private documents R2 bucket is not bound to this Worker.");
    }
    const object = await documentsBucket.get(`${bucket}/${path}`);
    if (!object) return invalid(404, "Private file not found.");
    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed.", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  }

  const identity = await getIdentity(request);
  if (identity instanceof Response) return identity;
  const documentsBucket = (await getEnv()).DOCUMENTS_BUCKET;
  if (!documentsBucket) {
    return invalid(503, "The private documents R2 bucket is not bound to this Worker.");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE + 64 * 1024) {
      return invalid(413, "Private files must be no larger than 10 MB.");
    }
    const form = await request.formData();
    const bucket = String(form.get("bucket") ?? "");
    const path = parseObjectPath(String(form.get("path") ?? ""));
    const file = form.get("file");
    if (!isPrivateBucket(bucket) || !path || !(file instanceof File)) {
      return invalid(400, "Invalid private file upload.");
    }
    if (file.size < 1 || file.size > MAX_FILE_SIZE) {
      return invalid(413, "Private files must be no larger than 10 MB.");
    }
    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      return invalid(415, "Only PDF, JPEG, PNG, and WEBP files are accepted.");
    }
    if (!isOwnerPath(bucket, path, identity.userId) || !await canAccess(identity, bucket, path)) {
      return invalid(403, "You may only upload files to your own authorized folder.");
    }
    await documentsBucket.put(`${bucket}/${path}`, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    return Response.json({ path }, { status: 201 });
  }

  let body: {
    action?: unknown;
    bucket?: unknown;
    path?: unknown;
    paths?: unknown;
    expiresIn?: unknown;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return invalid(400, "Invalid private file request.");
  }

  const bucket = typeof body.bucket === "string" ? body.bucket : "";
  if (!isPrivateBucket(bucket)) return invalid(400, "Unknown private file bucket.");
  const action = body.action;

  if (action === "sign") {
    const path = typeof body.path === "string" ? parseObjectPath(body.path) : null;
    if (!path) return invalid(400, "Invalid private file path.");
    if (!await canAccess(identity, bucket, path)) {
      return invalid(403, "You are not authorized to access this private file.");
    }
    const requestedTtl = typeof body.expiresIn === "number" ? body.expiresIn : 300;
    try {
      const signedUrl = await createSignedUrl(request.url, bucket, path, requestedTtl);
      return Response.json({ signedUrl, expiresIn: Math.max(1, Math.min(Math.floor(requestedTtl), MAX_URL_TTL_SECONDS)) });
    } catch (error) {
      if (error instanceof Error && error.message === "Private file not found.") {
        return invalid(404, error.message);
      }
      throw error;
    }
  }

  if (action === "delete") {
    if (!Array.isArray(body.paths) || body.paths.length === 0 || body.paths.length > 20) {
      return invalid(400, "Provide between 1 and 20 private file paths.");
    }
    const paths = body.paths.map((value) =>
      typeof value === "string" ? parseObjectPath(value) : null,
    );
    if (paths.some((path) => !path)) return invalid(400, "Invalid private file path.");
    const administrator = await isAdmin(identity);
    for (const path of paths) {
      if (
        !administrator &&
        (!isOwnerPath(bucket, path!, identity.userId) ||
          (REQUIRED_ROLE[bucket] && !await hasRole(identity, REQUIRED_ROLE[bucket])))
      ) {
        return invalid(403, "You may only delete files from your own folder.");
      }
    }
    await Promise.all(paths.map((path) => documentsBucket.delete(`${bucket}/${path}`)));
    return Response.json({ deleted: paths.length });
  }

  return invalid(400, "Unknown private file operation.");
}
