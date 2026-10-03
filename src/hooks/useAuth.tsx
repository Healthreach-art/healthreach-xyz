import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { resolveUserAccount, type AppRole, type ResolvedProfile } from "@/lib/auth-session";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  approvalStatus: string | null;
  profile: ResolvedProfile | null;
  isDemo: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  approvalStatus: null,
  profile: null,
  isDemo: false,
  loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [loading, setLoading] = useState(true);
  const hydrateId = useRef(0);

  async function hydrateSession(nextSession: Session | null) {
    const currentHydrate = ++hydrateId.current;
    setLoading(true);
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
    setRole(null);
    setApprovalStatus(null);
    setProfile(null);

    if (!nextSession?.user) {
      setLoading(false);
      return;
    }

    try {
      const account = await resolveUserAccount(nextSession.user);
      if (currentHydrate !== hydrateId.current) return;
      setRole(account.role);
      setApprovalStatus(account.approvalStatus);
      setProfile(account.profile);
    } catch {
      if (currentHydrate !== hydrateId.current) return;
      setRole("patient");
      setApprovalStatus(null);
      setProfile({
        full_name: nextSession.user.user_metadata?.full_name ?? "",
        email: nextSession.user.email ?? "",
        organization_name: "",
        phone: "",
        address: "",
        is_demo: false,
        avatar_url: "",
      });
    } finally {
      if (currentHydrate === hydrateId.current) setLoading(false);
    }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "TOKEN_REFRESHED") {
          setSession(session);
          setUser(session?.user ?? null);
          return;
        }

        if (event === "INITIAL_SESSION") return;

        window.setTimeout(() => void hydrateSession(session), 0);
      }
    );

    // Firebase is the primary sign-in. If a Firebase user exists, build the
    // session from Firestore; otherwise fall back to the old system.
    let fbUnsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { onFirebaseAuthChange } = await import("@/lib/firebase-auth");
        fbUnsub = await onFirebaseAuthChange(async (fb) => {
          if (cancelled) return;
          if (!fb) {
            const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
            void hydrateSession(data.session);
            return;
          }
          const currentHydrate = ++hydrateId.current;
          const { getProfile, getUserRoles } = await import("@/lib/firestore");
          const [p, roles] = await Promise.all([
            getProfile(fb.uid).catch(() => null) as Promise<Record<string, unknown> | null>,
            getUserRoles(fb.uid).catch(() => [] as string[]),
          ]);
          if (currentHydrate !== hydrateId.current) return;
          const email = fb.email ?? "";
          const isBootstrap = email.toLowerCase() === "admin@healthreachcare.co.za";
          const r = (isBootstrap || roles.includes("admin") ? "admin" : (roles[0] ?? (p?.role as string) ?? "patient")) as AppRole;
          const fakeUser = {
            id: fb.uid, email, aud: "authenticated", app_metadata: {}, created_at: "",
            user_metadata: { full_name: (p?.fullName as string) ?? fb.displayName ?? "", role: r },
          } as unknown as User;
          setUser(fakeUser);
          setSession({ user: fakeUser, access_token: "", refresh_token: "", expires_in: 3600, token_type: "bearer" } as unknown as Session);
          setRole(r);
          setApprovalStatus((p?.status as string) ?? (r === "patient" || r === "admin" ? "approved" : "pending_review"));
          setProfile({
            full_name: (p?.fullName as string) ?? fb.displayName ?? "",
            email,
            organization_name: (p?.organizationName as string) ?? "",
            phone: (p?.phone as string) ?? "",
            address: (p?.address as string) ?? "",
            is_demo: false,
            avatar_url: fb.photoURL ?? "",
          });
          setLoading(false);
        });
      } catch {
        supabase.auth.getSession().then(({ data: { session } }) => void hydrateSession(session)).catch(() => setLoading(false));
      }
    })();

    return () => { cancelled = true; subscription.unsubscribe(); fbUnsub?.(); };
  }, []);

  // Live-sync approval/role when admin updates the current user.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`auth-profile-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` }, () => {
        if (session) void hydrateSession(session);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` }, () => {
        if (session) void hydrateSession(session);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, session]);


  const signOut = async () => {
    hydrateId.current += 1;
    try { const { firebaseSignOut } = await import("@/lib/firebase-auth"); await firebaseSignOut(); } catch { /* ignore */ }
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setSession(null);
    setRole(null);
    setApprovalStatus(null);
    setProfile(null);
    if (typeof document !== "undefined") {
      // Reset persisted sidebar state so the next login starts fresh.
      document.cookie = "sidebar_state=; path=/; max-age=0";
    }
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  return (
    <AuthContext value={{ user, session, role, approvalStatus, profile, isDemo: !!profile?.is_demo, loading, signOut }}>
      {children}
    </AuthContext>
  );
}
