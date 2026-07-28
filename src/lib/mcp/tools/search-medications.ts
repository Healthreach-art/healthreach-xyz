import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export default defineTool({
  name: "search_medications",
  title: "Search medications",
  description: "Search the HEALTHREACH pharmacy catalog for in-stock medications by name or category.",
  inputSchema: {
    query: z.string().min(1).describe("Text to match against medication name, description, or category."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows to return (default 15)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const q = query.replace(/[%,]/g, " ").trim();
    const { data, error } = await supabase
      .from("medications")
      .select("id, pharmacy_id, name, description, category, price, requires_prescription, stock_quantity")
      .or(`name.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`)
      .gt("stock_quantity", 0)
      .limit(limit ?? 15);
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { medications: data ?? [] },
    };
  },
});
