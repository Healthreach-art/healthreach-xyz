import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Hard-delete the signed-in user's account and every record we own that
 * references them. After this runs, the same email can sign up fresh.
 *
 * We delete from public tables explicitly (in FK-safe order) and then call
 * the Auth Admin API to remove the auth.users row. Most FKs cascade, but
 * being explicit keeps the cleanup deterministic even when a table was
 * created without ON DELETE CASCADE.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;

    // Best-effort cleanup of every table that stores user-owned rows.
    // We swallow individual table errors so one missing/renamed table
    // can't block account deletion.
    const wipe = async (
      table: string,
      column: "user_id" | "patient_id" | "pharmacy_id" | "driver_id" | "doctor_id" | "admin_id" | "sender_id" | "invited_by" | "used_by" | "actor_id" | "dispensed_by",
    ) => {
      try {
        await supabaseAdmin.from(table).delete().eq(column, uid);
      } catch {
        /* ignore */
      }
    };

    // Order matters loosely (children before parents).
    await wipe("order_messages", "sender_id");
    await wipe("appointment_messages", "sender_id");
    await wipe("order_group_events", "actor_id");
    await wipe("prescription_audit_log", "actor_id");
    await wipe("admin_audit_log", "admin_id");
    await wipe("delivery_offers", "pharmacy_id");
    await wipe("delivery_offers", "driver_id" as never);
    await wipe("pharmacy_offers", "pharmacy_id");
    await wipe("deliveries", "driver_id");
    await wipe("driver_locations", "driver_id");
    await wipe("driver_status", "driver_id");
    await wipe("driver_payouts", "driver_id");
    await wipe("driver_bank_accounts", "driver_id");
    await wipe("driver_documents", "driver_id");
    await wipe("doctor_reviews", "doctor_id");
    await wipe("doctor_availability", "doctor_id");
    await wipe("doctor_appointments", "patient_id");
    await wipe("doctor_appointments", "doctor_id");
    await wipe("doctor_documents", "doctor_id");
    await wipe("doctors", "user_id");
    await wipe("pharmacy_appointments", "patient_id");
    await wipe("pharmacy_appointments", "pharmacy_id");
    await wipe("pharmacy_documents", "pharmacy_id");
    await wipe("pharmacy_branches", "pharmacy_id");
    await wipe("medications", "pharmacy_id");
    await wipe("payments", "user_id");
    await wipe("orders", "patient_id");
    await wipe("orders", "pharmacy_id");
    await wipe("order_groups", "patient_id");
    await wipe("order_groups", "pharmacy_id");
    await wipe("prescription_uploads", "patient_id");
    await wipe("prescription_uploads", "pharmacy_id");
    await wipe("prescription_uploads", "dispensed_by");
    await wipe("prescriptions", "patient_id");
    await wipe("e_prescriptions", "patient_id");
    await wipe("e_prescriptions", "doctor_id");
    await wipe("family_members", "user_id");
    await wipe("medication_reminders", "user_id");
    await wipe("notifications", "user_id");
    await wipe("notification_preferences", "user_id");
    await wipe("user_addresses", "user_id");
    await wipe("ratings", "user_id");
    await wipe("complaints", "user_id");
    await wipe("wallet_transactions", "user_id");
    await wipe("wallets", "user_id");
    await wipe("saved_payment_methods", "user_id");
    await wipe("card_pins", "user_id");
    await wipe("patient_verifications", "patient_id" as never);
    await wipe("admin_invites", "invited_by");
    await wipe("admin_invites", "used_by");
    await wipe("user_roles", "user_id");
    await wipe("profiles", "user_id");

    // Finally remove the auth user — this also clears their session.
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (delErr) throw new Error(`Could not delete account: ${delErr.message}`);

    return { ok: true };
  });
