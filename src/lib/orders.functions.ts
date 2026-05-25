import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      orderId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Load order, ensure ownership
    const { data: order, error: oerr } = await supabaseAdmin
      .from("orders")
      .select("id, patient_id, status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oerr || !order) return { ok: false, reason: "not_found" as const };
    if (order.patient_id !== userId) return { ok: false, reason: "forbidden" as const };
    if (["delivered", "cancelled", "out_for_delivery"].includes(order.status as string)) {
      return { ok: false, reason: "stage" as const };
    }
    // Check delivery assigned
    const { data: del } = await supabaseAdmin
      .from("deliveries")
      .select("id, driver_id")
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (del?.driver_id) return { ok: false, reason: "driver_assigned" as const };

    await supabaseAdmin
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
        cancellation_reason: data.reason ?? "Patient cancellation",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.orderId);

    // Close pending offers
    await supabaseAdmin.from("pharmacy_offers")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("order_id", data.orderId).eq("status", "open");
    await supabaseAdmin.from("delivery_offers")
      .update({ status: "cancelled" })
      .eq("order_id", data.orderId).eq("status", "open");

    // Refund any completed payment (mock)
    await supabaseAdmin.from("payments")
      .update({ refund_status: "refunded" } as never)
      .eq("order_id", data.orderId).eq("status", "completed");

    return { ok: true as const };
  });

export const canCancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ orderId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: order } = await supabaseAdmin
      .from("orders").select("patient_id, status").eq("id", data.orderId).maybeSingle();
    if (!order || order.patient_id !== context.userId) return { allowed: false };
    if (["delivered", "cancelled", "out_for_delivery"].includes(order.status as string)) {
      return { allowed: false };
    }
    const { data: del } = await supabaseAdmin
      .from("deliveries").select("driver_id").eq("order_id", data.orderId).maybeSingle();
    return { allowed: !del?.driver_id };
  });
