import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "patient" | "pharmacy" | "hospital" | "driver" | "admin" | "doctor";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  approvalStatus: string | null;
  profile: {
    full_name: string;
    email: string;
    organization_name: string;
    phone: string;
    address: string;
    is_demo: boolean;
  } | null;
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

  async function fetchUserData(userId: string) {
    const [roleRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("full_name, email, organization_name, phone, address, approval_status").eq("user_id", userId).maybeSingle(),
    ]);

    if (roleRes.data) setRole(roleRes.data.role as AppRole);
    if (profileRes.data) {
      setApprovalStatus(profileRes.data.approval_status);
      setProfile({
        full_name: profileRes.data.full_name,
        email: profileRes.data.email,
        organization_name: profileRes.data.organization_name ?? "",
        phone: profileRes.data.phone ?? "",
        address: profileRes.data.address ?? "",
      });
    }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setRole(null);
          setApprovalStatus(null);
          setProfile(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
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
    <AuthContext value={{ user, session, role, approvalStatus, profile, loading, signOut }}>
      {children}
    </AuthContext>
  );
}
