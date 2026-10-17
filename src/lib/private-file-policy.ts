export const MAX_PRIVATE_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PRESCRIPTION_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_PRESCRIPTION_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export function isOwnerPrivateFilePath(bucket: string, path: string, userId: string) {
  const parts = path.split("/");
  const ownerPath = bucket === "documents" && parts[0] === "documents"
    ? parts.slice(1)
    : parts;
  return ownerPath.length >= 2 && ownerPath[0] === userId;
}

export async function validatePrivateFile(file: File, bucket: string): Promise<string | null> {
  const maxSize = bucket === "prescriptions" ? MAX_PRESCRIPTION_FILE_SIZE : MAX_PRIVATE_FILE_SIZE;
  if (file.size < 1 || file.size > maxSize) {
    return bucket === "prescriptions"
      ? "Prescription and identity files must be no larger than 8 MB."
      : "Private files must be no larger than 10 MB.";
  }
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return "Only PDF, JPEG, PNG, and WEBP files are accepted.";
  }
  if (bucket !== "prescriptions") return null;
  if (!ALLOWED_PRESCRIPTION_CONTENT_TYPES.has(file.type)) {
    return "Prescription and identity files must be PDF, JPEG, or PNG.";
  }

  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === "application/pdf"
    && header.length >= 5
    && header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44
    && header[3] === 0x46 && header[4] === 0x2d) return null;
  if (file.type === "image/jpeg"
    && header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return null;
  if (file.type === "image/png"
    && header.length >= 8
    && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e
    && header[3] === 0x47 && header[4] === 0x0d && header[5] === 0x0a
    && header[6] === 0x1a && header[7] === 0x0a) return null;
  return "The file contents do not match the selected PDF, JPEG, or PNG format.";
}
