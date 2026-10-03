import { defineTool } from "@lovable.dev/mcp-js";
import { firestoreAdmin } from "@/lib/firestore-admin";
import { z } from "zod";

export default defineTool({
  name: "search_medications",
  title: "Search medications",
  description: "Search the HealthReachCare pharmacy catalog for in-stock medications by name or category.",
  inputSchema: {
    query: z.string().min(1).describe("Text to match against medication name, description, or category."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows to return (default 15)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }

    const { data, error } = await firestoreAdmin.rpc("mcp_search_medications", {
      query,
      limit: limit ?? 15,
    });
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { medications: data ?? [] },
    };
  },
});
