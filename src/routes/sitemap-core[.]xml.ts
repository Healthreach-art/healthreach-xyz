import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buildSitemapResponse } from "@/lib/sitemap.server";

export const Route = createFileRoute("/sitemap-core.xml")({
  server: {
    handlers: {
      GET: async () =>
        buildSitemapResponse([
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/about", changefreq: "monthly", priority: "0.8" },
          { path: "/contact", changefreq: "monthly", priority: "0.7" },
          { path: "/terms", changefreq: "monthly", priority: "0.5" },
          { path: "/privacy", changefreq: "monthly", priority: "0.5" },
          { path: "/track", changefreq: "weekly", priority: "0.6" },
        ]),
    },
  },
});
