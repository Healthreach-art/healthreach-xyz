import { defineTool } from "@lovable.dev/mcp-js";

import { createClient } from "@supabase/supabase-js";

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description: "Return the signed-in HealthReachCareCare user's profile: id, email, role, and approval status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userId = ctx.getUserId();
    const [{ data: profile }, { data: roleRow }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, organization_name, phone, approval_status, is_verified, is_active").eq("user_id", userId!).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId!).maybeSingle(),
    ]);
    const payload = {
      user_id: userId,
      email: ctx.getUserEmail(),
      role: roleRow?.role ?? "patient",
      profile: profile ?? null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
