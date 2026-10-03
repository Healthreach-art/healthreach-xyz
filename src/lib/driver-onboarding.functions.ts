import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";

export const saveDriverProfilePhoto = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input) => z.object({
    avatarUrl: z.string().url().max(1000),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { firestoreAdmin } = await import("@/lib/firestore-admin");
    const { data: userResult, error: userError } = await firestoreAdmin.auth.admin.getUserById(context.userId);
    if (userError) throw new Error(userError.message);
    if (!userResult) throw new Error("Could not load the signed-in Firebase user.");

    const user = userResult.user;
    const { error } = await firestoreAdmin
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