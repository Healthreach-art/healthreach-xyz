import { defineTool } from "@lovable.dev/mcp-js";
import { firestoreAdmin } from "@/lib/firestore-admin";


export default defineTool({
  name: "whoami",
  title: "Who am I",
  description: "Return the signed-in HealthReachCare user's profile: id, email, role, and approval status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }

    const { data: payload, error } = await firestoreAdmin.rpc("mcp_whoami");
    if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
