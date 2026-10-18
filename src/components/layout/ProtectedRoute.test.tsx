import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";

const authMock = vi.hoisted(() => ({ value: { firebaseUser: null as any, profile: null as any, profileError: null as string | null, adminClaimStatus: "not-admin" as string, loading: false } }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => authMock.value }));

function renderProtected(allow: ("teacher" | "admin")[] = ["teacher"]) {
  return render(<MemoryRouter initialEntries={["/private"]}><Routes>
    <Route element={<ProtectedRoute allow={allow} />}>
      <Route path="/private" element={<p>{allow.includes("admin") ? "Admin dashboard" : "Teacher workspace"}</p>} />
    </Route>
    <Route path="/login/teacher" element={<p>Teacher login</p>} />
    <Route path="/login/admin" element={<p>Admin login</p>} />
    <Route path="/unauthorized" element={<p>Access denied</p>} />
  </Routes></MemoryRouter>);
}

describe("ProtectedRoute", () => {
  beforeEach(() => { authMock.value = { firebaseUser: null, profile: null, profileError: null, adminClaimStatus: "not-admin", loading: false }; });

  it("sends unauthenticated users to teacher sign-in", () => {
    renderProtected();
    expect(screen.getByText("Teacher login")).toBeInTheDocument();
  });

  it("denies a teacher role with a missing/non-active server profile status", () => {
    authMock.value.firebaseUser = { uid: "teacher-1" };
    authMock.value.profile = { uid: "teacher-1", role: "teacher", status: "disabled" };
    renderProtected();
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });

  it("allows only an active teacher profile", () => {
    authMock.value.firebaseUser = { uid: "teacher-1" };
    authMock.value.profile = { uid: "teacher-1", role: "teacher", status: "active" };
    renderProtected();
    expect(screen.getByText("Teacher workspace")).toBeInTheDocument();
  });

  it("allows an admin only after the profile and refreshed custom claim are confirmed", () => {
    authMock.value.firebaseUser = { uid: "admin-1" };
    authMock.value.profile = { uid: "admin-1", role: "admin", status: "active" };
    authMock.value.adminClaimStatus = "verified";
    renderProtected(["admin"]);
    expect(screen.getByText("Admin dashboard")).toBeInTheDocument();
  });

  it("denies a teacher from admin routes", () => {
    authMock.value.firebaseUser = { uid: "teacher-1" };
    authMock.value.profile = { uid: "teacher-1", role: "teacher", status: "active" };
    renderProtected(["admin"]);
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });

  it("sends a signed-out user to the admin login", () => {
    renderProtected(["admin"]);
    expect(screen.getByText("Admin login")).toBeInTheDocument();
  });

  it("explains missing or stale admin claims rather than trusting the profile role", () => {
    authMock.value.firebaseUser = { uid: "admin-1" };
    authMock.value.profile = { uid: "admin-1", role: "admin", status: "active" };
    authMock.value.adminClaimStatus = "missing";
    renderProtected(["admin"]);
    expect(screen.getByText("This account is not authorized to access the admin panel. Contact the system administrator.")).toBeInTheDocument();
  });

  it("shows profile read failures and missing profiles without redirecting away", () => {
    authMock.value.firebaseUser = { uid: "admin-1" };
    authMock.value.profileError = "permission-denied";
    const { unmount } = renderProtected(["admin"]);
    expect(screen.getByText("Admin access is temporarily unavailable. Please try again later.")).toBeInTheDocument();
    unmount();
    authMock.value.profileError = null;
    renderProtected(["admin"]);
    expect(screen.getByText("This account is not authorized to access the admin panel. Contact the system administrator.")).toBeInTheDocument();
  });

  it("waits for role loading instead of redirecting early", () => {
    authMock.value.loading = true;
    renderProtected(["admin"]);
    expect(screen.getByText("Checking your session…")).toBeInTheDocument();
    expect(screen.queryByText("Admin login")).not.toBeInTheDocument();
  });
});
