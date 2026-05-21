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
    const apiKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_MAPS_API_KEY;
    const result: Record<string, string> = {};
    await Promise.all(
      data.points.map(async (p) => {
        const fallback = `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
        if (!apiKey || !connKey) {
          result[p.id] = fallback;
          return;
        }
        try {
          const res = await fetch(
            `${GATEWAY_URL}/maps/api/geocode/json?latlng=${p.lat},${p.lng}&result_type=street_address|route|premise|neighborhood`,
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "X-Connection-Api-Key": connKey,
              },
            },
          );
          if (!res.ok) {
            result[p.id] = fallback;
            return;
          }
          const json = (await res.json()) as {
            results?: Array<{ formatted_address?: string }>;
          };
          result[p.id] = json.results?.[0]?.formatted_address ?? fallback;
        } catch {
          result[p.id] = fallback;
        }
      }),
    );
    return { addresses: result };
  });
