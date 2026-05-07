import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Link } from "@tanstack/react-router";
import { UserPlus, AlertCircle, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up — HEALTHREACH" },
      { name: "description", content: "Create your HEALTHREACH account." },
    ],
  }),
  component: SignupPage,
});

const roles = [
  { value: "patient", label: "Patient", description: "Order medication and track health" },
  { value: "pharmacy", label: "Pharmacy", description: "Manage inventory and fulfill orders" },
  // Hospital role temporarily hidden — only Patient, Pharmacy, Driver are user-selectable.
  { value: "driver", label: "Driver", description: "Deliver medications to patients" },
] as const;

function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("patient");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const needsOrg = ["pharmacy"].includes(selectedRole);
  const needsApproval = ["pharmacy", "driver"].includes(selectedRole);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: selectedRole,
        },
        emailRedirectTo: window.location.origin,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Update org name if needed
    if (needsOrg && orgName) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ organization_name: orgName }).eq("user_id", user.id);
      }
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="healthcare-card p-8 max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-healthcare-green/20">
            <CheckCircle className="h-6 w-6 text-healthcare-green" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Account Created!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {needsApproval
              ? "Your account is pending admin approval. You'll be notified once approved."
              : "Please check your email to verify your account."}
          </p>
          <Button className="mt-6" onClick={() => navigate({ to: "/login" })}>
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
            <h1 className="text-2xl font-bold text-foreground">Create Account</h1>
            <p className="mt-1 text-sm text-muted-foreground">Join HEALTHREACH today</p>
          </div>

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

            <div className="space-y-2">
              <Label>Select Your Role</Label>
              <div className="grid gap-2">
                {roles.map((role) => (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => setSelectedRole(role.value)}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selectedRole === role.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                      selectedRole === role.value ? "border-primary" : "border-muted-foreground"
                    }`}>
                      {selectedRole === role.value && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{role.label}</div>
                      <div className="text-xs text-muted-foreground">{role.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {needsOrg && (
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. City Pharmacy" required maxLength={200} />
              </div>
            )}

            {needsApproval && (
              <div className="rounded-lg bg-accent p-3 text-xs text-muted-foreground">
                ⚠️ This role requires admin approval before you can access the platform.
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
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
              try { localStorage.setItem("hr_oauth_role", selectedRole); } catch {}
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
