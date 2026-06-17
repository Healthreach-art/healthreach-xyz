import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buildSitemapResponse } from "@/lib/sitemap.server";

export const Route = createFileRoute("/sitemap-drivers.xml")({
  server: {
    handlers: {
      GET: async () =>
        buildSitemapResponse([
          { path: "/for-drivers", changefreq: "weekly", priority: "0.9" },
          { path: "/driver/onboarding", changefreq: "monthly", priority: "0.6" },
          { path: "/signup", changefreq: "monthly", priority: "0.5" },
        ]),
    },
  },
});
