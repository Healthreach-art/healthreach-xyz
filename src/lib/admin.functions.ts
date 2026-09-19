import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const codeInput = z.object({ code: z.string().min(4).max(128) });

/**
 * Promote the currently signed-in user to admin if they supply the
 * correct ADMIN_INVITE_CODE secret. Replaces their existing self-assigned
 * role with `admin` and auto-approves the profile.
 */
export const claimAdminWithCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => codeInput.parse(i))
  .handler(async ({ data, context }) => {
    const expected = process.env.ADMIN_INVITE_CODE;
    if (!expected) throw new Error("Admin invite code is not configured");
    if (data.code.trim() !== expected.trim()) {
      throw new Error("Invalid invite code");
    }
    const userId = context.userId;
    // Remove any existing role rows for this user, then insert admin.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: insertErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (insertErr) throw new Error(insertErr.message);
    await supabaseAdmin
      .from("profiles")
      .update({ approval_status: "approved" })
      .eq("user_id", userId);
    return { ok: true };
  });

const broadcastInput = z.object({
  audience: z.enum(["all", "patient", "pharmacy", "driver", "hospital"]),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  link: z.string().max(255).optional().default(""),
});

/**
 * Admin-only: insert an in-app notification for every user matching the
 * audience role (or every user when audience === "all"). Bypasses RLS via
 * the service-role client because notifications RLS only permits an admin
 * caller to insert into their own user_id row otherwise.
 */
export const broadcastNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => broadcastInput.parse(i))
  .handler(async ({ data, context }) => {
    // Verify caller is admin
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Admin role required");

    let userIds: string[] = [];
    if (data.audience === "all") {
      const { data: rows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id");
      userIds = (rows ?? []).map((r) => r.user_id);
    } else {
      const { data: rows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", data.audience);
      userIds = (rows ?? []).map((r) => r.user_id);
    }
    // Dedupe
    userIds = Array.from(new Set(userIds));
    if (userIds.length === 0) return { ok: true, count: 0 };

    const rows = userIds.map((uid) => ({
      user_id: uid,
      category: "announcement",
      title: data.title,
      body: data.body,
      link: data.link ?? "",
    }));
    // Chunk inserts to stay under PostgREST payload limits.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabaseAdmin
        .from("notifications")
        .insert(rows.slice(i, i + CHUNK));
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: rows.length };
  });

// Demo seed removed — HealthReachCare now ships with no demo data.


