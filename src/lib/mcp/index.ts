import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listMyOrdersTool from "./tools/list-my-orders";
import listMyPrescriptionsTool from "./tools/list-my-prescriptions";
import searchMedicationsTool from "./tools/search-medications";

const projectId = "healthreachcare-prod";
const oauthIssuer = (process.env.MCP_OAUTH_ISSUER ?? "https://healthreachcare.co.za").replace(/\/+$/, "");
const oauthFunctionUrl = (
  process.env.MCP_OAUTH_FUNCTION_URL
  ?? "https://us-central1-healthreachcare-prod.cloudfunctions.net/mcpOAuth"
).replace(/\/+$/, "");

export default defineMcp({
  name: "healthreach-mcp",
  title: "HealthReachCare",
  version: "0.1.0",
  instructions:
    "Read-only tools for the signed-in HealthReachCare user's profile, orders, prescriptions, and the pharmacy medication catalog. User data is scoped by the authenticated MCP data endpoint.",
  auth: auth.oauth.issuer({
    issuer: oauthIssuer,
    resource: `${oauthIssuer}/mcp`,
    acceptedAudiences: projectId,
    jwksUri: `${oauthFunctionUrl}/jwks`,
    requiredScopes: ["mcp:tools"],
  }),
  tools: [whoamiTool, listMyOrdersTool, listMyPrescriptionsTool, searchMedicationsTool],
});
