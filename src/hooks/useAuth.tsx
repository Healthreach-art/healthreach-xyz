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
  authError: string | null;
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
  authError: null,
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

function profilesMatch(a: ResolvedProfile | null, b: ResolvedProfile): boolean {
  return !!a &&
    a.full_name === b.full_name &&
    a.email === b.email &&
    a.organization_name === b.organization_name &&
    a.phone === b.phone &&
    a.address === b.address &&
    a.is_demo === b.is_demo &&
    a.avatar_url === b.avatar_url;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [profile, setProfile] = useState<ResolvedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const hydrateId = useRef(0);
  const firebaseUserRef = useRef<FirebaseAuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const hydrate = async (firebaseUser: FirebaseAuthUser | null) => {
      const currentHydrate = ++hydrateId.current;
      const previousUid = firebaseUserRef.current?.uid;
      firebaseUserRef.current = firebaseUser;
      setLoading(true);
      setAuthError(null);

      if (firebaseUser && previousUid && previousUid !== firebaseUser.uid) {
        setUser(null);
        setSession(null);
        setRole(null);
        setApprovalStatus(null);
        setProfile(null);
      }

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
        const account = await resolveUserAccount(firebaseUser, null, { repairMissing: false });
        const appUser = createAppUser(firebaseUser, account.role);
        const token = await getFirebaseIdToken();
        if (!token) throw new Error("Firebase did not provide an ID token for the signed-in user.");
        if (cancelled || currentHydrate !== hydrateId.current) return;

        setUser(appUser);
        setSession({
          user: appUser,
          access_token: token,
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
        setUser(null);
        setSession(null);
        setRole(null);
        setApprovalStatus(null);
        setProfile(null);
        setAuthError("We could not verify your account. Please sign in again.");
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
      if (!cancelled) {
        setUser(null);
        setSession(null);
        setRole(null);
        setApprovalStatus(null);
        setProfile(null);
        setAuthError("Authentication could not be initialized. Please refresh and try again.");
        setLoading(false);
      }
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
      if (!firebaseUser || firebaseUser.uid !== user.id) return;
      try {
        const account = await resolveUserAccount(firebaseUser, null, { repairMissing: false });
        if (cancelled) return;
        setRole((current) => current === account.role ? current : account.role);
        setApprovalStatus((current) => current === account.approvalStatus ? current : account.approvalStatus);
        setProfile((current) => profilesMatch(current, account.profile) ? current : account.profile);
        setUser((current) => (
          current?.id === firebaseUser.uid &&
          current.user_metadata.role === account.role &&
          current.user_metadata.full_name === (firebaseUser.displayName ?? "")
            ? current
            : createAppUser(firebaseUser, account.role)
        ));
      } catch (error) {
        console.error("[auth] Could not refresh the signed-in user's Firestore account.", error);
      }
    };

    void fsSubscribe("profiles", [where("user_id", "==", user.id)], () => void refreshAccount())
      .then((stop) => {
        if (cancelled) stop();
        else stopProfiles = stop;
      })
      .catch((error: unknown) => {
        console.error("[auth] Could not subscribe to Firestore profile changes.", error);
      });
    void fsSubscribe("user_roles", [where("user_id", "==", user.id)], () => void refreshAccount())
      .then((stop) => {
        if (cancelled) stop();
        else stopRoles = stop;
      })
      .catch((error: unknown) => {
        console.error("[auth] Could not subscribe to Firestore role changes.", error);
      });

    return () => {
      cancelled = true;
      stopProfiles?.();
      stopRoles?.();
    };
  }, [user?.id]);

  const signOut = async () => {
    hydrateId.current += 1;
    const { firebaseSignOut } = await import("@/lib/firebase-auth");
    await firebaseSignOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setApprovalStatus(null);
    setProfile(null);
    setAuthError(null);
    if (typeof document !== "undefined") {
      document.cookie = "sidebar_state=; path=/; max-age=0";
    }
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  return (
    <AuthContext value={{ user, session, role, approvalStatus, profile, isDemo: !!profile?.is_demo, loading, authError, signOut }}>
      {children}
    </AuthContext>
  );
}
