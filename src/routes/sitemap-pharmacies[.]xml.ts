import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buildSitemapResponse, fetchPublishedRows, type SitemapEntry } from "@/lib/sitemap.server";

export const Route = createFileRoute("/sitemap-pharmacies.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/for-pharmacies", changefreq: "weekly", priority: "0.9" },
          { path: "/pharmacy/onboarding", changefreq: "monthly", priority: "0.6" },
          { path: "/signup", changefreq: "monthly", priority: "0.5" },
        ];
        const pharmacies = await fetchPublishedRows("pharmacies", "id", "is_active=eq.true");
        for (const p of pharmacies) {
          entries.push({ path: `/pharmacy/${p.id}`, changefreq: "weekly", priority: "0.6" });
        }
        return buildSitemapResponse(entries);
      },
    },
  },
});
