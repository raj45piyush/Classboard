import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { adminLoginSchema, flattenZodError } from "@/utils/validation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { signInEmail } from "@/services/auth";
import { verifyAdminAccount } from "@/services/adminAuth";

export default function AdminLogin() {
  const { firebaseUser, profile, loading, profileError, adminClaimStatus } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingAdminUid, setPendingAdminUid] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingAdminUid || firebaseUser?.uid !== pendingAdminUid || loading) return;
    if (profile?.role === "admin" && profile.status === "active" && adminClaimStatus === "verified") {
      navigate("/admin", { replace: true });
      return;
    }
    if (profileError) {
      setError("Admin access is temporarily unavailable. Please try again later.");
      setPendingAdminUid(null);
    } else if (adminClaimStatus === "missing" || adminClaimStatus === "error" || (profile && profile.role !== "admin")) {
      setError(adminClaimStatus === "error"
        ? "Admin access is temporarily unavailable. Please try again later."
        : "This account is not authorized to access the admin panel. Contact the system administrator.");
      setPendingAdminUid(null);
    }
  }, [pendingAdminUid, firebaseUser?.uid, loading, profile, profileError, adminClaimStatus, navigate]);

  if (!loading && firebaseUser && profile?.role === "admin" && profile.status === "active" && adminClaimStatus === "verified") {
    return <Navigate to="/admin" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const result = adminLoginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(flattenZodError(result.error));
      return;
    }
    setSubmitting(true);
    try {
      const credential = await signInEmail(result.data.email, result.data.password);
      await verifyAdminAccount(credential.user);
      setPendingAdminUid(credential.user.uid);
    } catch (err: any) {
      setError(mapAuthError(err?.code));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardBody>
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#303238]" />
            <h1 className="text-lg font-semibold text-[#303238]">Admin sign in</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {error && <Alert tone="error">{error}</Alert>}
            {!error && firebaseUser && !loading && profile?.role === "admin" && adminClaimStatus !== "verified" && (
              <Alert tone="error">{profileError || adminClaimStatus === "error"
                ? "Admin access is temporarily unavailable. Please try again later."
                : "This account is not authorized to access the admin panel. Contact the system administrator."}</Alert>
            )}
            <div>
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="admin-password">Password</Label>
              <div className="relative"><Input
                className="pr-10"
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-2 rounded p-1 text-[#747780] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238]">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </div>
            <Button type="submit" className="w-full" loading={submitting}>
              Sign in
            </Button>
          </form>
          <Link to="/forgot-password" className="mt-3 block text-center text-sm text-[#747780] underline">Forgot password?</Link>
          <Link to="/" className="mt-3 block text-xs text-[#747780] underline">
            Back to home
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}

function mapAuthError(code?: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/too-many-requests":
    case "auth/network-request-failed":
    case "auth/operation-not-allowed":
      return "Unable to sign in. Check your credentials and try again.";
    case "auth/admin-email-unverified":
    case "auth/admin-role-required":
    case "profile/admin-account-disabled":
    case "profile/admin-profile-missing":
      return "This account is not authorized to access the admin panel. Contact the system administrator.";
    case "auth/admin-token-refresh-failed":
    case "firestore/permission-denied":
    case "firestore/profile-read-failed":
      return "Admin access is temporarily unavailable. Please try again later.";
    default:
      return "Unable to sign in. Check your credentials and try again.";
  }
}
