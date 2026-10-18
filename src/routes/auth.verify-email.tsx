import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fsGet, fsList, where } from "@/lib/firestore";
import { dashboardPathForRole, resolveUserRole, type AppRole } from "@/lib/auth-session";
import type { FirebaseAuthUser } from "@/lib/firebase-auth";

type VerificationSearch = {
  mode?: string;
  oobCode?: string;
  continue?: string;
  sent?: string;
  sendError?: string;
  setupError?: string;
  admin?: string;
  redirect?: string;
};

type VerificationState = "loading" | "pending" | "verified" | "expired" | "error";

type ContinuationInfo = {
  role: AppRole | null;
  approvalStatus: string | null;
  missingProfile: string[];
  missingDocuments: string[];
};

export const Route = createFileRoute("/auth/verify-email")({
  validateSearch: (search: Record<string, unknown>): VerificationSearch => ({
    mode: typeof search.mode === "string" ? search.mode : undefined,
    oobCode: typeof search.oobCode === "string" ? search.oobCode : undefined,
    continue: search.continue === "1" ? "1" : undefined,
    sent: search.sent === "1" ? "1" : undefined,
    sendError: search.sendError === "1" ? "1" : undefined,
    setupError: search.setupError === "1" ? "1" : undefined,
    admin: search.admin === "1" ? "1" : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Verify Your Email — HealthReachCare" },
      { name: "description", content: "Verify your email address to continue to HealthReachCare." },
    ],
  }),
  component: VerifyEmailPage,
});

const COOLDOWN_SECONDS = 60;
const RESEND_COOLDOWN_KEY = "hr_email_verification_resend_until";

function initialCooldown(sent: string | undefined): number {
  try {
    const storedUntil = localStorage.getItem(RESEND_COOLDOWN_KEY);
    if (storedUntil !== null) {
      const expiry = Number(storedUntil);
      return Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - Date.now()) / 1000)) : 0;
    }
    if (sent === "1") {
      localStorage.setItem(RESEND_COOLDOWN_KEY, String(Date.now() + COOLDOWN_SECONDS * 1000));
    }
  } catch {
    return sent === "1" ? COOLDOWN_SECONDS : 0;
  }
  return sent === "1" ? COOLDOWN_SECONDS : 0;
}

function firebaseErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  if (code === "auth/too-many-requests") return "Too many requests were made. Wait a little while before trying again.";
  if (code === "auth/network-request-failed") return "A network error prevented the email request. Check your connection and try again.";
  if (code === "auth/unauthorized-continue-uri" || code === "auth/invalid-continue-uri") {
    return "Firebase rejected the continuation address. Please contact HealthReachCare support.";
  }
  if (code === "auth/user-disabled") return "This account is disabled. Please contact HealthReachCare support.";
  return error instanceof Error ? error.message : "The request could not be completed. Please try again.";
}

function isSafeRedirect(value: string | undefined): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//");
}

async function loadContinuationInfo(user: FirebaseAuthUser): Promise<ContinuationInfo> {
  const [profile, roleRows] = await Promise.all([
    fsGet<Record<string, unknown>>("profiles", user.uid),
    fsList<{ role?: unknown }>("user_roles", where("user_id", "==", user.uid)),
  ]);
  const roles = roleRows.map((row) => row.role).filter((role): role is AppRole =>
    typeof role === "string" &&
    ["patient", "pharmacy", "hospital", "driver", "admin", "doctor", "homecare_company", "homecare_staff"].includes(role),
  );
  const role = roles.includes("admin") ? "admin" : roles[0] ?? null;
  const missingProfile = [
    !profile?.full_name && !user.displayName ? "Add your name to your profile." : "",
    !profile?.phone ? "Add a contact phone number to your profile." : "",
  ].filter(Boolean);
  const missingDocuments: string[] = [];
  let approvalStatus = typeof profile?.approval_status === "string" ? profile.approval_status : null;

  if (role === "doctor") {
    const rows = await fsList<Record<string, unknown>>(
      "doctor_documents",
      where("doctor_user_id", "==", user.uid),
    );
    const documents = rows[0];
    if (!documents?.hpcsa_cert_path) missingDocuments.push("HPCSA registration certificate");
    if (!documents?.id_document_path) missingDocuments.push("Identity document");
    if (!Array.isArray(documents?.qualification_paths) || documents.qualification_paths.length === 0) {
      missingDocuments.push("Qualification certificate");
    }
    if (!documents?.malpractice_cert_path) missingDocuments.push("Medical malpractice cover");
  } else if (role === "pharmacy") {
    const rows = await fsList<Record<string, unknown>>(
      "pharmacy_documents",
      where("pharmacy_id", "==", user.uid),
    );
    const documents = rows[0];
    const required: [string, string][] = [
      ["license_path", "Pharmacy operating license"],
      ["pharmacist_cert_path", "Pharmacist registration certificate"],
      ["business_reg_path", "Business registration"],
      ["proof_of_address_path", "Proof of physical address"],
      ["bank_confirmation_path", "Bank account confirmation"],
    ];
    for (const [field, label] of required) {
      if (!documents?.[field]) missingDocuments.push(label);
    }
    const reviews = documents?.document_reviews;
    if (reviews && typeof reviews === "object") {
      for (const [field, review] of Object.entries(reviews)) {
        if (
          review && typeof review === "object" &&
          "status" in review && review.status === "rejected"
        ) {
          const label = required.find(([key]) => key === field)?.[1] ?? field.replaceAll("_", " ");
          if (!missingDocuments.includes(label)) missingDocuments.push(`${label} (resubmission requested)`);
        }
      }
    }
  } else if (role === "driver") {
    const rows = await fsList<Record<string, unknown>>(
      "driver_documents",
      where("driver_id", "==", user.uid),
    );
    const documents = rows[0];
    if (!documents?.id_document_path) missingDocuments.push("Identity document");
    if (!documents?.license_path) missingDocuments.push("Driver license");
    if (!documents?.selfie_path) missingDocuments.push("Selfie holding your ID");
    if (
      documents &&
      documents.id_document_path &&
      documents.license_path &&
      documents.selfie_path &&
      !documents.submitted_at
    ) {
      missingDocuments.push("Submit your documents for administrator review");
    }
  } else if (role === "homecare_company") {
    const providers = await fsList<Record<string, unknown>>(
      "homecare_providers",
      where("user_id", "==", user.uid),
    );
    const provider = providers[0];
    if (provider) {
      approvalStatus = typeof provider.approval_status === "string"
        ? provider.approval_status
        : typeof provider.status === "string" ? provider.status : approvalStatus;
      const documents = await fsList<Record<string, unknown>>(
        "homecare_documents",
        where("provider_id", "==", provider.id),
      );
      const submitted = new Set(documents.map((document) => document.doc_key).filter((key): key is string =>
        typeof key === "string",
      ));
      const required = (provider.provider_type ?? provider.homecare_type) === "individual"
        ? ["id_document", "qualification", "professional_registration", "police_clearance", "proof_of_address", "bank_confirmation"]
        : ["business_registration", "tax_clearance", "proof_of_address", "bank_confirmation", "professional_indemnity", "staff_qualifications"];
      missingDocuments.push(...required.filter((key) => !submitted.has(key)).map((key) =>
        key.replaceAll("_", " "),
      ));
    }
  }

  return { role, approvalStatus, missingProfile, missingDocuments };
}

function VerifyEmailPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [status, setStatus] = useState<VerificationState>("loading");
  const [email, setEmail] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(() => initialCooldown(search.sent));
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [continuation, setContinuation] = useState<ContinuationInfo | null>(null);
  const [continuationError, setContinuationError] = useState("");
  const processedAction = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { firebaseApplyEmailVerificationCode, firebaseReloadCurrentUser } = await import("@/lib/firebase-auth");
        let actionEmail = "";
        if (search.mode === "verifyEmail" && search.oobCode && !processedAction.current) {
          processedAction.current = true;
          try {
            const action = await firebaseApplyEmailVerificationCode(search.oobCode);
            actionEmail = action.data.email ?? "";
          } catch (actionError) {
            if (!active) return;
            const code = (actionError as { code?: string })?.code ?? "";
            setStatus(code === "auth/expired-action-code" || code === "auth/invalid-action-code" ? "expired" : "error");
            setError(code === "auth/expired-action-code" || code === "auth/invalid-action-code"
              ? "This verification link has expired or has already been used. Sign in and request a new link."
              : firebaseErrorMessage(actionError));
            const current = await firebaseReloadCurrentUser();
            if (active && current) {
              setEmail(current.email ?? "");
              if (!current.emailVerified) setStatus("pending");
            }
            return;
          }
        }

        const current = await firebaseReloadCurrentUser();
        if (!active) return;
        setEmail(current?.email ?? actionEmail);
        setVerifiedEmail(actionEmail);
        if (current) {
          void loadContinuationInfo(current).then((info) => {
            if (active) setContinuation(info);
          }).catch((loadError: unknown) => {
            console.error("[auth] Could not load account continuation details.", loadError);
            if (active) setContinuationError("Some account details could not be loaded. You can still continue and finish them from your dashboard.");
          });
        }
        if (current?.emailVerified) {
          setVerifiedEmail(current.email ?? actionEmail);
          setStatus("verified");
        } else if (actionEmail) {
          setStatus("verified");
          setNotice("Your email is verified. Sign in with this email to continue.");
        } else if (!current && search.continue === "1") {
          setStatus("verified");
          setNotice("Firebase confirmed your email address. Sign in with that email to continue to your existing account.");
        } else {
          setStatus("pending");
          if (search.sendError === "1") {
            setError("Your account was created, but the verification email could not be sent. Use the resend button to try again.");
          }
          if (search.setupError === "1") {
            setNotice("Your account exists, but we could not finish saving your profile details. Please retry after verification or contact support.");
          }
        }
      } catch (loadError) {
        if (!active) return;
        setStatus("error");
        setError(firebaseErrorMessage(loadError));
      }
    };
    void load();
    return () => { active = false; };
  }, [search.continue, search.mode, search.oobCode, search.sendError, search.setupError]);

  const continueToAccount = async () => {
    setError("");
    setRefreshing(true);
    try {
      const { firebaseReloadCurrentUser } = await import("@/lib/firebase-auth");
      const user = await firebaseReloadCurrentUser();
      if (!user?.emailVerified) {
        setStatus("pending");
        setError("Firebase has not confirmed this email address yet. Open the verification link, then refresh your status.");
        return;
      }
      setVerifiedEmail(user.email ?? "");
      const account = continuation ?? await loadContinuationInfo(user);
      const isHomecareOperations = user.email?.trim().toLowerCase() === "support@healthreachcare.co.za";
      const role = isHomecareOperations
        ? await resolveUserRole(user)
        : account.role ?? await resolveUserRole(user, { fallbackRole: "patient" });
      let storedRedirect: string | null = null;
      try {
        storedRedirect = sessionStorage.getItem("hr_post_verification_redirect");
        sessionStorage.removeItem("hr_post_verification_redirect");
      } catch {
        // Continue to the user's dashboard if browser storage is unavailable.
      }
      const redirect = isSafeRedirect(search.redirect) ? search.redirect : storedRedirect ?? undefined;
      if (!isHomecareOperations && isSafeRedirect(redirect)) {
        window.location.assign(redirect);
        return;
      }
      window.location.assign(
        role === "admin" || user.email?.toLowerCase() === "admin@healthreachcare.co.za"
          ? "/firebase-admin"
          : dashboardPathForRole(role),
      );
    } catch (continueError) {
      console.error("[auth] Could not continue after email verification.", continueError);
      setError(firebaseErrorMessage(continueError));
    } finally {
      setRefreshing(false);
    }
  };

  const resend = async () => {
    setError("");
    setNotice("");
    setSending(true);
    try {
      const { firebaseSendEmailVerification } = await import("@/lib/firebase-auth");
      const sent = await firebaseSendEmailVerification();
      if (!sent) {
        await refreshStatus();
        return;
      }
      setCooldown(COOLDOWN_SECONDS);
      setNotice("Verification email sent. Check your inbox and spam or junk folder.");
    } catch (sendError) {
      console.error("[auth] Verification email could not be sent.", sendError);
      setError(firebaseErrorMessage(sendError));
      if ((sendError as { code?: string })?.code === "auth/too-many-requests") {
        try {
          localStorage.setItem(RESEND_COOLDOWN_KEY, String(Date.now() + COOLDOWN_SECONDS * 1000));
        } catch (storageError) {
          console.warn("[auth] Could not persist the verification resend cooldown.", storageError);
        }
        setCooldown(COOLDOWN_SECONDS);
      }
    } finally {
      setSending(false);
    }
  };

  const refreshStatus = async () => {
    setError("");
    setRefreshing(true);
    try {
      const { firebaseReloadCurrentUser } = await import("@/lib/firebase-auth");
      const user = await firebaseReloadCurrentUser();
      if (!user?.emailVerified) {
        setError("Firebase still reports this email as unverified. Open the link in your inbox, including any spam or junk folder.");
        return;
      }
      setVerifiedEmail(user.email ?? "");
      setStatus("verified");
      const info = await loadContinuationInfo(user);
      setContinuation(info);
      setNotice("Email verified. Continue to your account to finish any profile, document, or approval steps.");
    } catch (refreshError) {
      console.error("[auth] Could not refresh email verification status.", refreshError);
      setError(firebaseErrorMessage(refreshError));
    } finally {
      setRefreshing(false);
    }
  };

  const signOut = async () => {
    try {
      const { firebaseSignOut } = await import("@/lib/firebase-auth");
      await firebaseSignOut();
      await navigate({ to: "/login", replace: true });
    } catch (signOutError) {
      setError(firebaseErrorMessage(signOutError));
    }
  };

  const hasMatchingSession = !!email && email.toLowerCase() === verifiedEmail.toLowerCase();
  const pendingApproval = continuation?.role &&
    continuation.role !== "patient" &&
    continuation.role !== "admin" &&
    continuation.approvalStatus !== "approved";

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-8">
      <div className="healthcare-card w-full max-w-lg p-8">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            {status === "loading"
              ? <Loader2 className="h-7 w-7 animate-spin text-primary" />
              : status === "verified"
                ? <CheckCircle className="h-7 w-7 text-primary" />
                : <MailCheck className="h-7 w-7 text-primary" />}
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {status === "verified" ? "Email verified" : status === "expired" ? "Verification link expired" : "Verify your email"}
          </h1>
          {email && <p className="mt-2 text-sm text-muted-foreground">{email}</p>}
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && <p role="status" className="mb-4 rounded-lg bg-accent p-3 text-sm text-muted-foreground">{notice}</p>}
        {continuationError && <p role="status" className="mb-4 rounded-lg bg-accent p-3 text-sm text-muted-foreground">{continuationError}</p>}

        {search.admin === "1" && (
          <p className="mb-4 text-sm text-muted-foreground">
            Email verification does not grant administrator access. Return to Admin Sign Up after verification to complete your invite-code check.
          </p>
        )}

        {status === "loading" && <p className="text-center text-sm text-muted-foreground">Checking your verification status…</p>}

        {status === "pending" && (
          <>
            <p className="text-sm text-muted-foreground">
              Check your inbox for the HealthReachCare verification email. Also check your spam or junk folder. Your account is not verified until Firebase confirms it.
            </p>
            {pendingApproval && (
              <p className="mt-3 text-sm text-muted-foreground">
                Email verification does not approve your provider application. Your administrator approval status is <strong>{continuation?.approvalStatus ?? "pending review"}</strong>.
              </p>
            )}
            {continuation?.missingDocuments.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Documents still to submit: {continuation.missingDocuments.join(", ")}.
              </p>
            ) : null}
            {continuation?.missingProfile.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Profile completion: {continuation.missingProfile.join(" ")}
              </p>
            ) : null}
            <Button className="mt-6 w-full" onClick={() => void resend()} disabled={sending || cooldown > 0 || !email}>
              {sending ? "Sending…" : cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend verification email"}
            </Button>
            <Button variant="outline" className="mt-3 w-full" onClick={() => void refreshStatus()} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "I’ve verified my email — refresh status"}
            </Button>
          </>
        )}

        {status === "verified" && (
          <>
            {pendingApproval && (
              <p className="mb-3 text-sm text-muted-foreground">
                Your email is verified. Your provider account still requires administrator approval ({continuation?.approvalStatus ?? "pending review"}); verification does not approve it.
              </p>
            )}
            {continuation?.missingDocuments.length ? (
              <p className="mb-3 text-sm text-muted-foreground">
                Documents still to submit: {continuation.missingDocuments.join(", ")}.
              </p>
            ) : null}
            {continuation?.missingProfile.length ? (
              <p className="mb-3 text-sm text-muted-foreground">
                Profile completion: {continuation.missingProfile.join(" ")}
              </p>
            ) : null}
            {hasMatchingSession ? (
              <Button className="mt-4 w-full" onClick={() => void continueToAccount()} disabled={refreshing}>
                {refreshing ? "Continuing…" : "Continue to your account"}
              </Button>
            ) : (
              <div className="mt-5 flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">Sign in with the verified email address to continue to your existing account.</p>
                <Button asChild><Link to="/login">Go to sign in</Link></Button>
              </div>
            )}
          </>
        )}

        {status === "expired" && (
          <p className="text-sm text-muted-foreground">
            Verification links can expire or be used only once. Sign in to this account and request a fresh link.
          </p>
        )}

        {status === "error" && <p className="text-sm text-muted-foreground">The verification link could not be processed. You can sign in and request another link.</p>}

        {email && status !== "loading" && (
          <div className="mt-5 flex items-center justify-between text-sm">
            <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void signOut()}>
              Use a different account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
