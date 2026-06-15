import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://healthreachhub.lovable.app";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/about", changefreq: "monthly", priority: "0.8" },
          { path: "/contact", changefreq: "monthly", priority: "0.7" },
          { path: "/doctors", changefreq: "daily", priority: "0.9" },
          { path: "/for-patients", changefreq: "weekly", priority: "0.8" },
          { path: "/for-pharmacies", changefreq: "weekly", priority: "0.8" },
          { path: "/for-drivers", changefreq: "weekly", priority: "0.8" },
          { path: "/for-doctors", changefreq: "weekly", priority: "0.8" },
          { path: "/terms", changefreq: "monthly", priority: "0.5" },
          { path: "/privacy", changefreq: "monthly", priority: "0.5" },
          { path: "/track", changefreq: "weekly", priority: "0.6" },
          { path: "/signup", changefreq: "monthly", priority: "0.7" },
          { path: "/login", changefreq: "monthly", priority: "0.5" },
          { path: "/forgot-password", changefreq: "yearly", priority: "0.3" },
        ];

        // Append dynamic doctor profile pages for SEO.
        try {
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (url && key) {
            const r = await fetch(`${url}/rest/v1/doctors?select=id&is_active=eq.true`, {
              headers: { apikey: key, Authorization: `Bearer ${key}` },
            });
            if (r.ok) {
              const rows = (await r.json()) as { id: string }[];
              for (const row of rows) {
                entries.push({ path: `/doctors/${row.id}`, changefreq: "weekly", priority: "0.6" });
              }
            }
          }
        } catch { /* ignore — sitemap should still serve static entries */ }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ].filter(Boolean).join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
