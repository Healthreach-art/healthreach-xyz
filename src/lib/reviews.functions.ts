import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const reviewSchema = z.object({
  orderId: z.string().uuid(),
  pharmacyStars: z.number().int().min(1).max(5),
  pharmacyComment: z.string().max(500).optional(),
  driverStars: z.number().int().min(1).max(5).optional(),
  driverComment: z.string().max(500).optional(),
});

export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => reviewSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, patient_id, pharmacy_id, status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order || order.patient_id !== userId) return { ok: false, reason: "forbidden" as const };
    if (order.status !== "delivered") return { ok: false, reason: "not_delivered" as const };
    const { data: del } = await supabaseAdmin
      .from("deliveries").select("driver_id").eq("order_id", data.orderId).maybeSingle();

    const rows: Array<Record<string, unknown>> = [];
    if (order.pharmacy_id) {
      rows.push({
        patient_id: userId, order_id: order.id,
        target_type: "pharmacy", target_id: order.pharmacy_id,
        stars: data.pharmacyStars, comment: data.pharmacyComment ?? "",
      });
    }
    if (data.driverStars && del?.driver_id) {
      rows.push({
        patient_id: userId, order_id: order.id,
        target_type: "driver", target_id: del.driver_id,
        stars: data.driverStars, comment: data.driverComment ?? "",
      });
    }
    if (rows.length === 0) return { ok: false, reason: "nothing_to_rate" as const };
    const { error } = await supabaseAdmin.from("ratings").upsert(rows as never, {
      onConflict: "order_id,target_type,patient_id",
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: true as const };
  });

export const hasReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows } = await supabaseAdmin
      .from("ratings")
      .select("id")
      .eq("order_id", data.orderId)
      .eq("patient_id", context.userId);
    return { reviewed: (rows ?? []).length > 0 };
  });
