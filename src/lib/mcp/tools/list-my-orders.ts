import { defineTool } from "@lovable.dev/mcp-js";
import { firestoreAdmin } from "@/lib/firestore-admin";
import { z } from "zod";

export default defineTool({
  name: "list_my_orders",
  title: "List my orders",
  description: "List medication orders belonging to the signed-in HealthReachCare user. Newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Max orders to return (default 10)."),
    status: z.string().optional().describe("Optional status filter, e.g. 'pending', 'delivered'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }

    const { data, error } = await firestoreAdmin.rpc("mcp_list_my_orders", {
      limit: limit ?? 10,
      status,
    });
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { orders: data ?? [] },
    };
  },
});
