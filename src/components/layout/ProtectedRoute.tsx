import { Link, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/types";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";

export function ProtectedRoute({ allow }: { allow: UserRole[] }) {
  const { firebaseUser, profile, profileError, adminClaimStatus, loading } = useAuth();
  const requiresAdmin = allow.includes("admin");

  if (loading) return <FullPageSpinner label="Checking your session…" />;

  if (!firebaseUser) {
    const fallback = allow.includes("admin") ? "/login/admin" : "/login/teacher";
    return <Navigate to={fallback} replace />;
  }

  if (requiresAdmin && profileError) {
    return <AdminRouteError message="Admin access is temporarily unavailable. Please try again later." />;
  }

  if (!profile) {
    return requiresAdmin
      ? <AdminRouteError message="This account is not authorized to access the admin panel. Contact the system administrator." />
      : <Navigate to="/login/teacher" replace />;
  }

  if (!allow.includes(profile.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (profile.status !== "active") {
    return <Navigate to="/unauthorized" replace state={{ reason: profile.status === "disabled" ? "disabled" : "inactive" }} />;
  }

  if (requiresAdmin && adminClaimStatus !== "verified") {
    const message = adminClaimStatus === "error"
      ? "Admin access is temporarily unavailable. Please try again later."
      : "This account is not authorized to access the admin panel. Contact the system administrator.";
    return <AdminRouteError message={message} />;
  }

  return <Outlet />;
}

function AdminRouteError({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-4">
      <Alert tone="error">{message}</Alert>
      <Link className="text-sm text-[#303238] underline" to="/login/admin">Return to admin sign in</Link>
    </main>
  );
}
