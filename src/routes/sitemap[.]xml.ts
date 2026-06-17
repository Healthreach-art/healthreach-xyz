import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://healthreach.xyz";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const sitemaps = [
          "/sitemap-core.xml",
          "/sitemap-patients.xml",
          "/sitemap-pharmacies.xml",
          "/sitemap-hospitals.xml",
          "/sitemap-drivers.xml",
          "/sitemap-admin.xml",
        ];
        const now = new Date().toISOString();
        const body = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...sitemaps.map(
            (s) => `  <sitemap>\n    <loc>${BASE_URL}${s}</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>`,
          ),
          `</sitemapindex>`,
        ].join("\n");
        return new Response(body, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
