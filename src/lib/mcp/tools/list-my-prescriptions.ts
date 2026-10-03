import { defineTool } from "@lovable.dev/mcp-js";
import { firestoreAdmin } from "@/lib/firestore-admin";
import { z } from "zod";

export default defineTool({
  name: "list_my_prescriptions",
  title: "List my prescriptions",
  description: "List prescriptions belonging to the signed-in patient. Newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Max prescriptions to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }

    const { data, error } = await firestoreAdmin.rpc("mcp_list_my_prescriptions", {
      limit: limit ?? 10,
    });
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { prescriptions: data ?? [] },
    };
  },
});
