import { firestoreAdmin } from "./firestore-admin";

const BASE_URL = "https://healthreachcare.co.za";

export interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export function buildSitemapResponse(entries: SitemapEntry[]): Response {
  const urls = entries.map((entry) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${entry.path}</loc>`,
      entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : null,
      entry.priority ? `    <priority>${entry.priority}</priority>` : null,
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
}

export async function fetchPublishedRows(
  table: string,
  select: string,
  filter = "",
): Promise<Record<string, string>[]> {
  try {
    let query = firestoreAdmin.from(table).select(select);
    if (filter) {
      const [field, operator, value] = filter.split("=");
      if (operator !== "eq" || !field || value === undefined) return [];
      query = query.eq(field, value === "true" ? true : value === "false" ? false : value);
    }
    const { data, error } = await query;
    if (error) {
      console.error(`Sitemap lookup failed for ${table}:`, error.message);
      return [];
    }
    return ((data ?? []) as Record<string, string>[]).filter((r) => r.id);
  } catch (error) {
    console.error(`Sitemap lookup failed for ${table}:`, error);
    return [];
  }
}
