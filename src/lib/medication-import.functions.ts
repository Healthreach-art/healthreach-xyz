import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MEDICINE_CATEGORIES } from "@/lib/categories";

/**
 * AI bulk medicine import.
 *
 * Pharmacy pastes a free-form list (one med per line, CSV, or a price list).
 * The Lovable AI gateway extracts structured rows we can insert directly into
 * `medications`.
 */

const input = z.object({
  text: z.string().min(3).max(20_000),
  default_category: z.string().optional(),
});

interface ParsedMed {
  name: string;
  price: number;
  stock_quantity: number;
  category: string;
  requires_prescription: boolean;
  description?: string;
}

export const aiParseMedications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => input.parse(i))
  .handler(async ({ data }): Promise<{ items: ParsedMed[]; summary: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { items: [], summary: "AI bulk import is not available right now." };
    }

    const sys = `You are an assistant that converts a South African pharmacy's free-form medicine list into structured rows.
Output ONLY through the provided tool. Prices are in ZAR. Use 0 when stock is missing. Be conservative with prescription flag.
Available categories: ${MEDICINE_CATEGORIES.join(", ")}. Use "Other" when unsure.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "save_medications",
          description: "Save the parsed medication rows.",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string", description: "1-sentence summary for the pharmacist." },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    price: { type: "number", description: "Unit price in ZAR" },
                    stock_quantity: { type: "number", description: "Integer count; 0 if unknown" },
                    category: { type: "string", enum: MEDICINE_CATEGORIES as unknown as string[] },
                    requires_prescription: { type: "boolean" },
                    description: { type: "string" },
                  },
                  required: ["name", "price", "stock_quantity", "category", "requires_prescription"],
                  additionalProperties: false,
                },
              },
            },
            required: ["summary", "items"],
            additionalProperties: false,
          },
        },
      },
    ];

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sys },
            {
              role: "user",
              content: `Default category if unclear: ${data.default_category || "Other"}.\nFree-form medicine list to parse:\n\n${data.text}`,
            },
          ],
          tools,
          tool_choice: { type: "function", function: { name: "save_medications" } },
        }),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const j = await res.json();
      const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) return { items: [], summary: "No medications could be parsed from the text." };
      const parsed = JSON.parse(args) as { summary: string; items: ParsedMed[] };

      const allowed = new Set(MEDICINE_CATEGORIES as readonly string[]);
      const items: ParsedMed[] = (parsed.items ?? [])
        .map((m) => ({
          name: String(m.name ?? "").trim().slice(0, 120),
          price: Math.max(0, Number(m.price) || 0),
          stock_quantity: Math.max(0, Math.round(Number(m.stock_quantity) || 0)),
          category: allowed.has(m.category) ? m.category : (data.default_category || "Other"),
          requires_prescription: Boolean(m.requires_prescription),
          description: m.description ? String(m.description).slice(0, 500) : undefined,
        }))
        .filter((m) => m.name.length > 0 && m.price > 0)
        .slice(0, 200);

      return { items, summary: parsed.summary || `Parsed ${items.length} medication${items.length === 1 ? "" : "s"}.` };
    } catch (e) {
      return { items: [], summary: e instanceof Error ? e.message : "AI parsing failed." };
    }
  });
