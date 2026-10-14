import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buildSitemapResponse } from "@/lib/sitemap.server";

export const Route = createFileRoute("/sitemap-admin.xml")({
  server: {
    handlers: {
      GET: async () =>
        buildSitemapResponse([]),
    },
  },
});
