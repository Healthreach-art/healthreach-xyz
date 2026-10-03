import { createFileRoute } from "@tanstack/react-router";

const issuer = (process.env.MCP_OAUTH_ISSUER ?? "https://healthreachcare.co.za").replace(/\/+$/, "");
const functionUrl = (
  process.env.MCP_OAUTH_FUNCTION_URL
  ?? "https://us-central1-healthreachcare-prod.cloudfunctions.net/mcpOAuth"
).replace(/\/+$/, "");

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      GET: () => Response.json({
        issuer,
        authorization_endpoint: `${functionUrl}/authorize`,
        token_endpoint: `${functionUrl}/token`,
        registration_endpoint: `${functionUrl}/register`,
        jwks_uri: `${functionUrl}/jwks`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: ["mcp:tools"],
      }, {
        headers: { "Cache-Control": "public, max-age=3600" },
      }),
    },
  },
});
