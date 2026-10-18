import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import type { UserProfile } from "@/types";

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  profileError: string | null;
  adminClaimStatus: "not-admin" | "loading" | "verified" | "missing" | "error";
  /** True while we are still determining auth state or loading the Firestore profile. */
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [adminClaimStatus, setAdminClaimStatus] = useState<AuthContextValue["adminClaimStatus"]>("not-admin");

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthResolved(true);
      setProfileResolved(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setProfile(null);
      setProfileError(null);
      setAdminClaimStatus("not-admin");
      setProfileLoading(Boolean(user));
      setProfileResolved(!user);
      setFirebaseUser(user);
      setAuthResolved(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !firebaseUser) {
      setProfile(null);
      setProfileError(null);
      setProfileResolved(true);
      setProfileLoading(false);
      setAdminClaimStatus("not-admin");
      return;
    }
    setProfile(null);
    setProfileLoading(true);
    setProfileResolved(false);
    setProfileError(null);
    setAdminClaimStatus("not-admin");
    const ref = doc(db, "users", firebaseUser.uid);
    let current = true;
    const unsubscribe = onSnapshot(
      ref,
      async (snap) => {
        if (!current) return;
        if (snap.exists()) {
          const data = snap.data();
          const nextProfile: UserProfile = {
            uid: firebaseUser.uid,
            displayName: data.displayName ?? firebaseUser.displayName ?? "",
            email: data.email ?? firebaseUser.email,
            phoneNumber: data.phoneNumber ?? firebaseUser.phoneNumber,
            // Profile roles are constrained by Firestore rules: users may
            // self-create only a teacher record and cannot change role/status.
            // Admin records remain Admin SDK-created and are separately
            // authorized by custom claims in rules and privileged functions.
            role: data.role === "admin" || data.role === "teacher" ? data.role : "student",
            status: data.status === "active" ? "active" : data.status === "pending" ? "pending" : "disabled",
            createdAt: data.createdAt?.toMillis?.() ?? null,
            updatedAt: data.updatedAt?.toMillis?.() ?? null,
          };
          setProfile(nextProfile);
          if (nextProfile.role === "admin") {
            setAdminClaimStatus("loading");
            try {
              // Admin SDK claim changes are reflected only after refreshing the
              // Firebase ID token. Profile role alone never authorizes admin routes.
              const token = await firebaseUser.getIdTokenResult(true);
              if (current) setAdminClaimStatus(token.claims.role === "admin" ? "verified" : "missing");
            } catch {
              if (current) setAdminClaimStatus("error");
            }
          } else {
            setAdminClaimStatus("not-admin");
          }
        } else {
          // Anonymous / not-yet-provisioned users (students) have no profile doc.
          setProfile(
            firebaseUser.isAnonymous
              ? {
                  uid: firebaseUser.uid,
                  displayName: firebaseUser.displayName ?? "Student",
                  email: null,
                  role: "student",
                  status: "active",
                  createdAt: null,
                  updatedAt: null,
                }
              : null
          );
          setAdminClaimStatus("not-admin");
        }
        if (current) {
          setProfileResolved(true);
          setProfileLoading(false);
        }
      },
      (error) => {
        if (!current) return;
        const code = typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "unknown")
          : "unknown";
        setProfileError(code);
        // A previously authenticated anonymous classroom visitor can still use
        // locally cached, previously authorized lesson content while offline.
        if (firebaseUser.isAnonymous) {
          setProfile({
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName ?? "Student",
            email: null,
            role: "student",
            status: "active",
            createdAt: null,
            updatedAt: null,
          });
        }
        setProfile(null);
        setAdminClaimStatus("not-admin");
        setProfileResolved(true);
        setProfileLoading(false);
      }
    );
    return () => {
      current = false;
      unsubscribe();
    };
  }, [firebaseUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      profile,
      profileError,
      adminClaimStatus,
      loading: !authResolved || profileLoading || !profileResolved || adminClaimStatus === "loading",
      signOut: async () => {
        if (isFirebaseConfigured) {
          await firebaseSignOut(auth);
        }
      },
    }),
    [firebaseUser, profile, profileError, adminClaimStatus, authResolved, profileLoading, profileResolved]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
