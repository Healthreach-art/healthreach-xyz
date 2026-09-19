import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listMyOrdersTool from "./tools/list-my-orders";
import listMyPrescriptionsTool from "./tools/list-my-prescriptions";
import searchMedicationsTool from "./tools/search-medications";

// Direct Supabase issuer is required (proxy URL is rejected as an issuer mismatch).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "healthreach-mcp",
  title: "HealthReachCare",
  version: "0.1.0",
  instructions:
    "Tools to read the signed-in HealthReachCare user's data: profile, orders, prescriptions, and the pharmacy medication catalog. All data is scoped to the authenticated user via Supabase RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listMyOrdersTool, listMyPrescriptionsTool, searchMedicationsTool],
});
