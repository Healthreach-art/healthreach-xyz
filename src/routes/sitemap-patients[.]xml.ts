import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buildSitemapResponse, fetchPublishedRows, type SitemapEntry } from "@/lib/sitemap.server";

export const Route = createFileRoute("/sitemap-patients.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/for-patients", changefreq: "weekly", priority: "0.9" },
          { path: "/doctors", changefreq: "daily", priority: "0.9" },
          { path: "/signup", changefreq: "monthly", priority: "0.7" },
          { path: "/login", changefreq: "monthly", priority: "0.5" },
          { path: "/forgot-password", changefreq: "yearly", priority: "0.3" },
        ];
        const doctors = await fetchPublishedRows("doctors", "id", "is_active=eq.true");
        for (const d of doctors) {
          entries.push({ path: `/doctors/${d.id}`, changefreq: "weekly", priority: "0.6" });
        }
        return buildSitemapResponse(entries);
      },
    },
  },
});
