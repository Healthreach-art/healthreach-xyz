import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const inputSchema = z.object({
  points: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * Reverse-geocode a batch of {id, lat, lng} into human-readable street addresses
 * via the Google Maps gateway. Returns a map of id → formatted_address.
 * Failures fall back to "lat, lng" formatting per point.
 */
export const reverseGeocodeBatch = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const result: Record<string, string> = {};
    // Free OpenStreetMap reverse geocoding — works anywhere, no keys.
    for (const p of data.points) {
      const fallback = `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${p.lat}&lon=${p.lng}`,
          { headers: { "User-Agent": "HealthReachCare/1.0" } },
        );
        const j = res.ok ? ((await res.json()) as { display_name?: string }) : null;
        result[p.id] = j?.display_name ?? fallback;
      } catch {
        result[p.id] = fallback;
      }
    }
    return { addresses: result };
  });
