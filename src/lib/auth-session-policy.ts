export type AppRole =
  | "patient" | "pharmacy" | "hospital" | "driver" | "admin" | "doctor"
  | "homecare_company" | "homecare_staff" | "homecare_operations";

const APP_ROLES: AppRole[] = [
  "patient", "pharmacy", "hospital", "driver", "admin", "doctor", "homecare_company", "homecare_staff",
  "homecare_operations",
];
const SELF_SERVICE_ROLES: AppRole[] = [
  "patient", "pharmacy", "hospital", "driver", "doctor", "homecare_company", "homecare_staff",
];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function roleFromRows(roles: readonly unknown[]): AppRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("homecare_operations")) return "homecare_operations";
  return roles.find(isAppRole) ?? null;
}

export function roleToRepair(preferred: AppRole | null): AppRole {
  return preferred && SELF_SERVICE_ROLES.includes(preferred) ? preferred : "patient";
}

export function roleAfterLookupFailure(): AppRole {
  return "patient";
}

export function googleAuthErrorMessage(error: unknown, action: "sign-in" | "sign-up"): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  if (code === "auth/popup-closed-by-user") return `Google ${action} was cancelled.`;
  if (code === "auth/unauthorized-domain") {
    return "This website address isn't allowed for Google sign-in yet. Add it in Firebase → Authentication → Settings → Authorized domains.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Google sign-in is not enabled for this Firebase project. Enable the Google provider in Firebase Authentication settings.";
  }
  if (code === "auth/popup-blocked") return "Allow pop-ups for this website, then try Google sign-in again.";
  if (code === "auth/invalid-api-key") return "Firebase sign-in is not configured correctly. Check the Firebase Web API key configuration.";
  return error instanceof Error
    ? error.message
    : `Google ${action} couldn't complete. Please try again.`;
}
