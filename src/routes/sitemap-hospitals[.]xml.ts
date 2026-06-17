import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buildSitemapResponse } from "@/lib/sitemap.server";

export const Route = createFileRoute("/sitemap-hospitals.xml")({
  server: {
    handlers: {
      GET: async () =>
        buildSitemapResponse([
          { path: "/signup", changefreq: "monthly", priority: "0.6" },
          { path: "/contact", changefreq: "monthly", priority: "0.5" },
        ]),
    },
  },
});
