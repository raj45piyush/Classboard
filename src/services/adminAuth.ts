import { doc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";

/**
 * Admin authorization requires both the server-issued custom claim and the
 * matching active Firestore profile. The claim is force-refreshed so a claim
 * provisioned since the user's last sign-in is not hidden by a cached token.
 */
export async function verifyAdminAccount(user: User): Promise<void> {
  if (!user.emailVerified) {
    throw Object.assign(new Error("Verify this account's email before using admin access."), { code: "auth/admin-email-unverified" });
  }

  let token;
  try {
    token = await user.getIdTokenResult(true);
  } catch {
    throw Object.assign(new Error("Firebase could not refresh the administrator token. Check your connection and sign in again."), { code: "auth/admin-token-refresh-failed" });
  }
  if (token.claims.role !== "admin") {
    throw Object.assign(new Error("This account does not have the trusted administrator role. Use the secure admin provisioning procedure."), { code: "auth/admin-role-required" });
  }

  let profile;
  try {
    profile = await getDoc(doc(db, "users", user.uid));
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    throw Object.assign(
      new Error(code === "permission-denied"
        ? "Firebase denied access to the administrator profile. Confirm the profile and deployed Firestore rules."
        : "The administrator profile could not be checked. Check your connection and try again."),
      { code: code === "permission-denied" ? "firestore/permission-denied" : "firestore/profile-read-failed" }
    );
  }
  const data = profile.data();
  if (!profile.exists() || data?.uid !== user.uid || data?.email !== user.email || data?.role !== "admin") {
    throw Object.assign(new Error("The trusted administrator profile is missing or does not match this account. Re-run the secure admin provisioning procedure."), { code: "profile/admin-profile-missing" });
  }
  if (data.status !== "active") {
    throw Object.assign(new Error("This administrator account is disabled. Contact the project owner."), { code: "profile/admin-account-disabled" });
  }
}
