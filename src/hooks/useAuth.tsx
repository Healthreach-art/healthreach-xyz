import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  getFirebaseIdToken,
  onFirebaseAuthChange,
  type FirebaseAuthUser,
} from "@/lib/firebase-auth";
import { resolveUserAccount, type AppRole, type ResolvedProfile } from "@/lib/auth-session";
import { fsSubscribe, where } from "@/lib/firestore";

type AuthUser = {
  id: string;
  email: string | null;
  user_metadata: { full_name: string; role: AppRole };
  app_metadata: Record<string, never>;
  created_at: string;
  aud: "authenticated";
};

type AuthSession = {
  user: AuthUser;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "bearer";
};

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
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

function createAppUser(firebaseUser: FirebaseAuthUser, role: AppRole): AuthUser {
  return {
    id: firebaseUser.uid,
    email: firebaseUser.email,
    user_metadata: {
      full_name: firebaseUser.displayName ?? "",
      role,
    },
    app_metadata: {},
    created_at: "",
    aud: "authenticated",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [profile, setProfile] = useState<ResolvedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const hydrateId = useRef(0);
  const firebaseUserRef = useRef<FirebaseAuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const hydrate = async (firebaseUser: FirebaseAuthUser | null) => {
      const currentHydrate = ++hydrateId.current;
      firebaseUserRef.current = firebaseUser;
      setLoading(true);

      if (!firebaseUser) {
        setUser(null);
        setSession(null);
        setRole(null);
        setApprovalStatus(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const account = await resolveUserAccount(firebaseUser);
        const appUser = createAppUser(firebaseUser, account.role);
        const token = await getFirebaseIdToken();
        if (cancelled || currentHydrate !== hydrateId.current) return;

        setUser(appUser);
        setSession({
          user: appUser,
          access_token: token ?? "",
          refresh_token: "",
          expires_in: 3600,
          token_type: "bearer",
        });
        setRole(account.role);
        setApprovalStatus(account.approvalStatus);
        setProfile(account.profile);
      } catch (error) {
        console.error("[auth] Could not load the signed-in user's Firestore account.", error);
        if (cancelled || currentHydrate !== hydrateId.current) return;

        const appUser = createAppUser(firebaseUser, "patient");
        setUser(appUser);
        setSession({
          user: appUser,
          access_token: "",
          refresh_token: "",
          expires_in: 3600,
          token_type: "bearer",
        });
        setRole("patient");
        setApprovalStatus(null);
        setProfile({
          full_name: firebaseUser.displayName ?? "",
          email: firebaseUser.email ?? "",
          organization_name: "",
          phone: "",
          address: "",
          is_demo: false,
          avatar_url: firebaseUser.photoURL ?? "",
        });
      } finally {
        if (!cancelled && currentHydrate === hydrateId.current) setLoading(false);
      }
    };

    void onFirebaseAuthChange((firebaseUser) => {
      if (!cancelled) void hydrate(firebaseUser);
    }).then((stop) => {
      if (cancelled) stop();
      else unsubscribe = stop;
    }).catch((error: unknown) => {
      console.error("[auth] Could not subscribe to Firebase Authentication.", error);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      hydrateId.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    let stopProfiles: (() => void) | undefined;
    let stopRoles: (() => void) | undefined;

    const refreshAccount = async () => {
      const firebaseUser = firebaseUserRef.current;
      if (!firebaseUser) return;
      try {
        const account = await resolveUserAccount(firebaseUser, role);
        if (cancelled) return;
        setRole(account.role);
        setApprovalStatus(account.approvalStatus);
        setProfile(account.profile);
        setUser(createAppUser(firebaseUser, account.role));
      } catch (error) {
        console.error("[auth] Could not refresh the signed-in user's Firestore account.", error);
      }
    };

    void Promise.all([
      fsSubscribe("profiles", [where("user_id", "==", user.id)], () => void refreshAccount()),
      fsSubscribe("user_roles", [where("user_id", "==", user.id)], () => void refreshAccount()),
    ]).then(([profilesStop, rolesStop]) => {
      if (cancelled) {
        profilesStop();
        rolesStop();
      } else {
        stopProfiles = profilesStop;
        stopRoles = rolesStop;
      }
    }).catch((error: unknown) => {
      console.error("[auth] Could not subscribe to Firestore account changes.", error);
    });

    return () => {
      cancelled = true;
      stopProfiles?.();
      stopRoles?.();
    };
  }, [user?.id, role]);

  const signOut = async () => {
    hydrateId.current += 1;
    const { firebaseSignOut } = await import("@/lib/firebase-auth");
    await firebaseSignOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setApprovalStatus(null);
    setProfile(null);
    if (typeof document !== "undefined") {
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
