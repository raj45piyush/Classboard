import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TeacherAuthPage from "./TeacherAuthPage";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as any }, profile: null as any,
  google: vi.fn(), emailSignIn: vi.fn(), createEmailUser: vi.fn(), updateProfile: vi.fn(),
  ensureProfile: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ profile: mocks.profile, firebaseUser: mocks.auth.currentUser, loading: false }) }));
vi.mock("@/services/auth", () => ({
  signInEmail: mocks.emailSignIn,
  registerEmailTeacher: mocks.createEmailUser,
  signInGoogleTeacher: mocks.google,
  ensureTeacherProfile: mocks.ensureProfile,
}));
function makeUser(providerId = "password") {
  return { uid: "teacher-1", email: "teacher@example.com", emailVerified: false, phoneNumber: null, displayName: "Taylor Teacher", providerData: [{ providerId }], getIdToken: vi.fn().mockResolvedValue("token"), getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: "teacher" } }) };
}

function renderAuth(path = "/auth/teacher") {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/auth/teacher" element={<TeacherAuthPage />} />
    <Route path="/teacher" element={<p>Teacher dashboard</p>} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.currentUser = null; mocks.profile = null;
  mocks.ensureProfile.mockResolvedValue(undefined);
  mocks.createEmailUser.mockResolvedValue(makeUser());
});

describe("teacher authentication", () => {
  it.each([
    ["/auth/teacher?mode=signin", "Sign in"],
    ["/auth/teacher?mode=register", "Create Teacher Account"],
  ])("renders the selected form on initial load at %s without a stale profile card", (path, expectedButton) => {
    renderAuth(path);
    expect(screen.getByRole("button", { name: expectedButton })).toBeInTheDocument();
    expect(screen.queryByText("Finish your teacher profile")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry profile setup" })).not.toBeInTheDocument();
  });

  it("shows registration fields, requires phone and consent, and completes without email verification", async () => {
    const user = makeUser(); mocks.createEmailUser.mockResolvedValue(user);
    renderAuth("/auth/teacher?mode=register");
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
    expect(screen.getByLabelText("Country calling code")).toHaveValue("+91");
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Taylor Teacher" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secure-password-123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create Teacher Account" }));
    await screen.findByText("Teacher dashboard");
    expect(mocks.createEmailUser).toHaveBeenCalledOnce();
    expect(mocks.ensureProfile).toHaveBeenCalledWith(user, "Taylor Teacher", "+919876543210");
    expect(user.emailVerified).toBe(false);
  });

  it("uses Firebase email/password for login without requesting an OTP", async () => {
    const user = makeUser(); mocks.emailSignIn.mockResolvedValue({ user });
    renderAuth();
    expect(screen.queryByLabelText("Phone number")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Teacher dashboard");
    expect(mocks.emailSignIn).toHaveBeenCalledOnce();
  });

  it("calls real Google sign-in and asks for a profile phone if missing", async () => {
    const user = makeUser("google.com"); mocks.google.mockResolvedValue({ user });
    mocks.ensureProfile.mockRejectedValueOnce({ code: "profile/phone-required", message: "Enter a valid phone number to finish teacher profile setup." });
    renderAuth();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await screen.findByText(/Enter a valid phone number/);
    expect(mocks.google).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
  });

  it("clears Google loading after cancellation without showing profile recovery", async () => {
    mocks.google.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    renderAuth();
    const button = screen.getByRole("button", { name: "Continue with Google" });
    fireEvent.click(button);
    expect(await screen.findByText("Google sign-in was cancelled. You can try again when ready.")).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(screen.queryByText("Finish your teacher profile")).not.toBeInTheDocument();
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
  });

  it("reports Google authentication separately when trusted profile provisioning fails", async () => {
    const user = makeUser("google.com"); mocks.google.mockResolvedValue({ user });
    mocks.ensureProfile.mockRejectedValue({ code: "unavailable", message: "temporary database failure" });
    renderAuth();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("button", { name: "Retry profile setup" })).toBeInTheDocument();
    expect(screen.getByText(/Firestore did not respond in time/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).not.toBeDisabled();
    expect(mocks.google).toHaveBeenCalledOnce();
    expect(mocks.ensureProfile).toHaveBeenCalledOnce();
    expect(screen.queryByText("Teacher dashboard")).not.toBeInTheDocument();
  });

  it("keeps the selected auth form available after a backend failure and retries the real profile call", async () => {
    const user = makeUser();
    mocks.emailSignIn.mockResolvedValue({ user });
    mocks.ensureProfile.mockRejectedValueOnce({ code: "profile/deadline-exceeded", message: "try later" });
    renderAuth();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText(/Teacher profile setup timed out/);
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry profile setup" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry profile setup" }));
    await screen.findByText("Teacher dashboard");
    expect(mocks.ensureProfile).toHaveBeenCalledTimes(2);
  });

  it("clears a failed profile recovery state when switching between login and registration", async () => {
    const user = makeUser();
    mocks.emailSignIn.mockResolvedValue({ user });
    mocks.ensureProfile.mockRejectedValueOnce({ code: "unavailable", message: "temporarily unavailable" });
    renderAuth("/auth/teacher?mode=signin");
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("button", { name: "Retry profile setup" });
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Create Teacher Account" }));
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.queryByText("Finish your teacher profile")).not.toBeInTheDocument();
    expect(screen.queryByText(/inspect the provisionTeacherProfile Cloud Function logs/)).not.toBeInTheDocument();
  });

  it.each([
    ["auth/invalid-credential", "The email or password is incorrect."],
    ["auth/invalid-login-credentials", "The email or password is incorrect."],
    ["auth/wrong-password", "The email or password is incorrect."],
    ["auth/user-not-found", "No account was found for this email."],
    ["auth/too-many-requests", "Too many attempts. Wait a while and try again."],
    ["auth/network-request-failed", "Network error. Check your connection and try again."],
    ["auth/operation-not-allowed", "Email/Password authentication is disabled."],
  ])("shows a useful %s error and resets login loading", async (code, message) => {
    mocks.emailSignIn.mockRejectedValue({ code });
    renderAuth("/auth/teacher?mode=signin");
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(message, { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.queryByText("Finish your teacher profile")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
  });

  it("clears the previous login error when a new attempt starts", async () => {
    mocks.emailSignIn.mockRejectedValueOnce({ code: "auth/invalid-credential" }).mockResolvedValueOnce({ user: makeUser() });
    renderAuth();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("The email or password is incorrect.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Teacher dashboard");
    expect(screen.queryByText("The email or password is incorrect.")).not.toBeInTheDocument();
  });

  it("shows an existing-email error only on the registration form", async () => {
    mocks.createEmailUser.mockRejectedValue({ code: "auth/email-already-in-use" });
    renderAuth("/auth/teacher?mode=register");
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Taylor Teacher" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "teacher@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secure-password-123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create Teacher Account" }));
    expect(await screen.findByText(/An account already uses this email/)).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.queryByText("Finish your teacher profile")).not.toBeInTheDocument();
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
  });

  it("shows a link to password reset and switches modes in one page", () => {
    renderAuth();
    expect(screen.getByRole("link", { name: "Forgot Password?" })).toHaveAttribute("href", "/forgot-password");
    fireEvent.click(screen.getByRole("tab", { name: "Create Teacher Account" }));
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });
});
