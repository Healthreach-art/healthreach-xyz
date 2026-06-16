import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AddressPicker, type PickedAddress } from "@/components/AddressPicker";
import { UserPlus, AlertCircle, MailCheck, ArrowLeft } from "lucide-react";


type SignupSearch = { role?: "patient" | "pharmacy" | "driver" | "doctor" | "hospital" };


export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): SignupSearch => {
    const r = search.role;
    return { role: r === "pharmacy" || r === "driver" || r === "doctor" || r === "hospital" ? r : "patient" };
  },
  head: () => ({
    meta: [
      { title: "Sign Up — HEALTHREACH" },
      { name: "description", content: "Create your HEALTHREACH account." },
    ],
  }),
  component: SignupPage,
});

const ROLE_META = {
  patient: { label: "Patient", title: "Create Patient Account", desc: "Join HEALTHREACH today" },
  pharmacy: { label: "Pharmacy", title: "Become a Pharmacy Partner", desc: "Manage inventory and fulfill orders" },
  driver: { label: "Driver", title: "Become a Driver", desc: "Deliver medications to patients" },
  doctor: { label: "Doctor", title: "Register as a Doctor", desc: "Self-register, upload HPCSA + legal docs, get approved" },
  hospital: { label: "Hospital", title: "Register your Hospital", desc: "Issue digital prescriptions and manage your doctors" },
} as const;

function SignupPage() {
  const navigate = useNavigate();
  const { role = "patient" } = useSearch({ from: "/signup" }) as SignupSearch;
  const meta = ROLE_META[role];
  const needsOrg = role === "pharmacy" || role === "hospital";
  const needsApproval = role === "pharmacy" || role === "driver" || role === "doctor" || role === "hospital";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!address || !address.lat || !address.lng) {
      setError("Please pick your address from the suggestions or use 'current location' so it's verified on the map.");
      return;
    }
    setLoading(true);

    // Clear any lingering session from a previous account so the new
    // signup doesn't get redirected into someone else's dashboard.
    try { await supabase.auth.signOut(); } catch {}

    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          address: address.address,
          lat: address.lat,
          lng: address.lng,
          phone: phone || undefined,
          organization_name: needsOrg ? orgName : undefined,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });


    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };


  if (success) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Check your email</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
            Click it to verify your account and finish signing in.
          </p>
          {needsApproval && (
            <p className="mt-3 text-xs text-muted-foreground">
              After verifying your email, your {meta.label.toLowerCase()} account will be reviewed by an admin before going live.
            </p>
          )}
          <Button className="mt-6 w-full" onClick={() => navigate({ to: "/login" })}>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }


  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="healthcare-card p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full healthcare-gradient">
              <UserPlus className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{meta.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{meta.desc}</p>
          </div>

          {role !== "patient" && (
            <Link
              to="/signup"
              search={{ role: "patient" }}
              className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to patient signup
            </Link>
          )}

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" required maxLength={100} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required maxLength={255} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>

            {needsOrg && (
              <div className="space-y-2">
                <Label htmlFor="orgName">{role === "hospital" ? "Hospital Name" : "Pharmacy Name"}</Label>
                <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={role === "hospital" ? "e.g. City General Hospital" : "e.g. City Pharmacy"} required maxLength={200} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <Input id="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 71 123 4567" maxLength={40} />
            </div>

            <div className="space-y-1">
              <Label>{role === "pharmacy" ? "Pharmacy address" : role === "driver" ? "Starting / home base" : role === "doctor" ? "Practice address" : "Delivery address"}</Label>
              <AddressPicker
                value={address}
                onChange={setAddress}
                placeholder="Start typing your real street address…"
              />
              <p className="text-[11px] text-muted-foreground">
                Pick from the suggestions or tap the location icon — we verify it on Google Maps so deliveries land at a real place.
              </p>
            </div>

            {needsApproval && (
              <div className="rounded-lg bg-accent p-3 text-xs text-muted-foreground">
                ⚠️ This role requires admin approval before you can access the platform.
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : `Create ${meta.label} Account`}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={async () => {
              setError("");
              try { localStorage.setItem("hr_oauth_role", role); } catch {}
              try { await supabase.auth.signOut(); } catch {}
              const result = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: `${window.location.origin}/auth/callback`,
              });
              if (result.error) {
                setError(result.error.message ?? "Google sign-up failed");
              }
            }}

          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5 44.5 36.3 44.5 25c0-1.5-.2-3-.4-4.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.9 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 7 29.5 5 24 5 16 5 9 9.6 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 45c5.4 0 10.3-2 14-5.3l-6.5-5.3c-2 1.4-4.6 2.3-7.5 2.3-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9 41 16 45 24 45z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.5 5.3c-.5.4 7-5 7-13 0-1.5-.2-3-.4-4.5z"/>
            </svg>
            Continue with Google
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
