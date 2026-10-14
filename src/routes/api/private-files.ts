import { createFileRoute } from "@tanstack/react-router";
import { handlePrivateFileRequest } from "@/lib/r2-storage.server";

export const Route = createFileRoute("/api/private-files")({
  server: {
    handlers: {
      GET: async ({ request }) => handlePrivateFileRequest(request),
      POST: async ({ request }) => handlePrivateFileRequest(request),
    },
  },
});
