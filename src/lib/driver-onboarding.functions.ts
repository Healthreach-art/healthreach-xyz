import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const saveDriverProfilePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    avatarUrl: z.string().url().max(1000),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (userError) throw new Error(userError.message);

    const user = userResult.user;
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert({
        user_id: context.userId,
        avatar_url: data.avatarUrl,
        full_name: user?.user_metadata?.full_name ?? "",
        email: user?.email ?? "",
      }, { onConflict: "user_id" });

    if (error) throw new Error(error.message);
    return { avatarUrl: data.avatarUrl };
  });