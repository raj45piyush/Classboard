import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import type { User } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { registerEmailTeacher, signInEmail, signInGoogleTeacher, ensureTeacherProfile } from "@/services/auth";
import { teacherLoginSchema, teacherRegistrationSchema, flattenZodError } from "@/utils/validation";
import { GoogleSignInButton } from "@/components/auth/TeacherAuthOptions";
import { PhoneNumberField } from "@/components/auth/PhoneNumberField";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

type Mode = "signin" | "register";
type AuthPhase = "idle" | "authenticating" | "creatingProfile" | "profileSetupFailed" | "complete";

export default function TeacherAuthPage() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const mode: Mode = search.get("mode") === "register" ? "register" : "signin";
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+91");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [phase, setPhase] = useState<AuthPhase>("idle");
  const busy = phase === "authenticating" || phase === "creatingProfile";
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [profileRecoveryMode, setProfileRecoveryMode] = useState<Mode | null>(null);
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [nameRequired, setNameRequired] = useState(false);
  const [profilePhone, setProfilePhone] = useState<string | undefined>(undefined);
  const flowId = useRef(0);
  const operationInProgress = useRef(false);

  function clearProfileRecovery() {
    setProfileUser(null);
    setProfileRecoveryMode(null);
    setPhoneRequired(false);
    setNameRequired(false);
    setProfilePhone(undefined);
  }

  // The route stays mounted while its query string changes. Reset transient
  // auth/recovery UI whenever the selected tab changes, including browser nav.
  useEffect(() => {
    flowId.current += 1;
    setError(null);
    setNotice(null);
    setProfileUser(null);
    setProfileRecoveryMode(null);
    setPhoneRequired(false);
    setNameRequired(false);
    setProfilePhone(undefined);
    setPhase("idle");
  }, [mode]);

  if (!loading && profile?.role === "teacher" && profile.status === "active") return <Navigate to="/teacher" replace />;

  function switchMode(next: Mode) {
    flowId.current += 1;
    setError(null); setNotice(null); clearProfileRecovery(); setPhase("idle");
    setSearch(next === "register" ? { mode: "register" } : { mode: "signin" });
  }

  async function completeTeacher(user: User, name?: string, phone?: string) {
    const attempt = flowId.current;
    setError(null); setNotice(null); setPhase("creatingProfile");
    try {
      await ensureTeacherProfile(user, name, phone);
      if (attempt !== flowId.current) return;
      setPhase("complete");
      navigate("/teacher", { replace: true });
    } catch (err: any) {
      if (attempt !== flowId.current) return;
      if (import.meta.env.DEV) {
        console.error("Teacher profile setup failed", {
          code: err?.code || "unknown",
          message: typeof err?.message === "string" ? err.message : undefined,
        });
      }
      if (err?.code === "profile/phone-required" || err?.code === "profile/invalid-phone" || err?.code === "profile/name-required") {
        setProfileUser(user);
        setProfileRecoveryMode(mode);
        setPhoneRequired(err?.code !== "profile/name-required");
        setNameRequired(err?.code === "profile/name-required");
        setProfilePhone(phone);
        setError(profileSetupError(err));
        setPhase("profileSetupFailed");
      } else if (["profile/role-mismatch", "profile/account-inactive", "profile/identity-mismatch"].includes(err?.code)) {
        setError(profileSetupError(err));
        setPhase("profileSetupFailed");
      } else {
        setProfileUser(user);
        setProfileRecoveryMode(mode);
        setProfilePhone(phone);
        setError(profileSetupError(err));
        setPhase("profileSetupFailed");
      }
    }
  }

  async function handleEmail(event: FormEvent) {
    event.preventDefault(); if (busy || operationInProgress.current) return; setError(null); setNotice(null);
    if (mode === "signin") {
      const parsed = teacherLoginSchema.safeParse({ email, password });
      if (!parsed.success) return setError(flattenZodError(parsed.error));
      const attempt = flowId.current;
      operationInProgress.current = true;
      setPhase("authenticating");
      try {
        const credential = await signInEmail(parsed.data.email, parsed.data.password);
        if (attempt === flowId.current) await completeTeacher(credential.user);
      } catch (err: unknown) {
        if (attempt === flowId.current) {
          const code = firebaseErrorCode(err);
          logUnexpectedAuthError(code);
          setError(authError(code));
          setPhase("idle");
        }
      } finally {
        operationInProgress.current = false;
        if (attempt === flowId.current) setPhase((current) => current === "authenticating" ? "idle" : current);
      }
      return;
    }
    const parsed = teacherRegistrationSchema.safeParse({ displayName, email, phoneNumber, password, confirmPassword, consent });
    if (!parsed.success) return setError(flattenZodError(parsed.error));
    const attempt = flowId.current;
    operationInProgress.current = true;
    setPhase("authenticating");
    try {
      const user = await registerEmailTeacher(parsed.data.email, parsed.data.password);
      if (attempt !== flowId.current) return;
      setPassword(""); setConfirmPassword("");
      await completeTeacher(user, parsed.data.displayName, parsed.data.phoneNumber);
    } catch (err: unknown) {
      if (attempt === flowId.current) {
        const code = firebaseErrorCode(err);
        logUnexpectedAuthError(code);
        setError(authError(code, true));
        setPhase("idle");
      }
    } finally {
      operationInProgress.current = false;
      if (attempt === flowId.current) setPhase((current) => current === "authenticating" ? "idle" : current);
    }
  }

  async function handleGoogle() {
    if (busy || operationInProgress.current) return; setError(null); setNotice(null); clearProfileRecovery();
    const attempt = flowId.current;
    operationInProgress.current = true;
    setPhase("authenticating");
    try {
      const result = await signInGoogleTeacher();
      if (attempt !== flowId.current) return;
      await completeTeacher(result.user, result.user.displayName || undefined);
    } catch (err: unknown) {
      if (attempt === flowId.current) {
        const code = firebaseErrorCode(err);
        logUnexpectedAuthError(code);
        setError(authError(code));
        setPhase("idle");
      }
    } finally {
      operationInProgress.current = false;
      if (attempt === flowId.current) setPhase((current) => current === "authenticating" ? "idle" : current);
    }
  }

  async function retryProfile() {
    if (!profileUser || busy || operationInProgress.current) return;
    if (phoneRequired && !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) { setError("Enter a valid phone number with country code."); return; }
    const name = nameRequired ? displayName : profileUser.displayName || displayName || undefined;
    operationInProgress.current = true;
    try {
      await completeTeacher(profileUser, name, phoneRequired ? phoneNumber : profilePhone);
    } finally {
      operationInProgress.current = false;
    }
  }

  const tab = (active: boolean) => `rounded-md px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238] ${active ? "bg-[#303238] text-white" : "text-[#5f626a] hover:bg-[#F5F5F5]"}`;
  const passwordInput = (id: string, label: string, value: string, setter: (value: string) => void, show: boolean, toggle: () => void, autocomplete: string) => <div>
    <Label htmlFor={id}>{label}</Label>
    <div className="relative"><Input className="pr-10" id={id} type={show ? "text" : "password"} autoComplete={autocomplete} required value={value} onChange={(e) => setter(e.target.value)} />
      <button type="button" aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} onClick={toggle} className="absolute right-2 top-2 rounded p-1 text-[#747780] hover:text-[#303238] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
  </div>;

  return <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:py-10">
    <section className="text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Teacher access</h1>
      <p className="mt-2 text-sm text-[#747780]">Sign in or create an account to manage your classrooms.</p>
      <div className="mx-auto mt-5 inline-flex rounded-lg border border-[#D9DADD] bg-white p-1" role="tablist" aria-label="Teacher access mode">
        <button type="button" role="tab" aria-selected={mode === "signin"} className={tab(mode === "signin")} onClick={() => switchMode("signin")}>Login</button>
        <button type="button" role="tab" aria-selected={mode === "register"} className={tab(mode === "register")} onClick={() => switchMode("register")}>Create Teacher Account</button>
      </div>
      <Link className="mt-3 block text-xs text-[#747780] underline" to="/">Back to homepage</Link>
    </section>

    {(error || notice) && <div className="mx-auto mt-5 w-full max-w-2xl space-y-2">{error && <Alert tone="error">{error}</Alert>}{notice && <Alert tone="success">{notice}</Alert>}</div>}

    {profileUser && profileRecoveryMode === mode && phase === "profileSetupFailed" && <section className="mx-auto mt-5 w-full max-w-xl rounded-lg border border-[#D9DADD] bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Finish your teacher profile</h2>
      <p className="mt-1 text-sm text-[#747780]">Authentication succeeded. Retry profile setup after resolving the error above. Teacher access is granted only after Firestore confirms your own active teacher profile.</p>
      {nameRequired && <div className="mt-4"><Label htmlFor="profile-display-name">Full name</Label><Input id="profile-display-name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div>}
      {phoneRequired && <div className="mt-4"><PhoneNumberField value={phoneNumber} onChange={setPhoneNumber} /></div>}
      <Button className="mt-4" loading={busy} onClick={retryProfile}>Retry profile setup</Button>
    </section>}

    {mode === "signin" ? <section className="mx-auto mt-6 w-full max-w-md">
      <div className="mx-auto max-w-sm"><GoogleSignInButton onClick={handleGoogle} loading={busy} /></div>
      <div className="my-5 flex items-center gap-3 text-xs text-[#747780]"><span className="h-px flex-1 bg-[#D9DADD]" /><span>or sign in with</span><span className="h-px flex-1 bg-[#D9DADD]" /></div>
      <div className="rounded-lg border border-[#D9DADD] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><LockKeyhole className="h-4 w-4" />Email and password</h2>
        <form onSubmit={handleEmail} className="space-y-3" noValidate>
          <div><Label htmlFor="teacher-email">Email address</Label><Input id="teacher-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {passwordInput("teacher-password", "Password", password, setPassword, showPassword, () => setShowPassword(!showPassword), "current-password")}
          <div className="text-right"><Link className="text-xs text-[#5f626a] underline" to="/forgot-password">Forgot Password?</Link></div>
          <Button className="w-full" type="submit" loading={busy}>Sign in</Button>
        </form>
      </div>
    </section> : <section className="mx-auto mt-6 w-full max-w-xl rounded-lg border border-[#D9DADD] bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><UserRound className="h-4 w-4" />Create your teacher account</h2>
      <form onSubmit={handleEmail} className="space-y-3" noValidate>
        <div><Label htmlFor="teacher-name">Full name</Label><Input id="teacher-name" autoComplete="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
        <div><Label htmlFor="teacher-email">Email address</Label><Input id="teacher-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <PhoneNumberField value={phoneNumber} onChange={setPhoneNumber} />
        {passwordInput("teacher-password", "Password", password, setPassword, showPassword, () => setShowPassword(!showPassword), "new-password")}
        {passwordInput("teacher-confirm-password", "Confirm password", confirmPassword, setConfirmPassword, showConfirm, () => setShowConfirm(!showConfirm), "new-password")}
        <label className="flex items-start gap-2 text-xs leading-5 text-[#5f626a]"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-[#303238]" />I agree to use ClassBoard for teaching and to the storage of my profile information.</label>
        <Button className="w-full" type="submit" loading={busy}>Create Teacher Account</Button>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs text-[#747780]"><span className="h-px flex-1 bg-[#D9DADD]" /><span>or</span><span className="h-px flex-1 bg-[#D9DADD]" /></div>
      <GoogleSignInButton onClick={handleGoogle} loading={busy} />
      <p className="mt-3 text-xs text-[#747780]">Google sign-up uses the same secure profile setup. If no phone number is on your account, you will be asked for one.</p>
    </section>}
    <p className="mt-5 text-center text-xs text-[#747780]">{mode === "signin" ? <>Need an account? <button className="font-medium underline" onClick={() => switchMode("register")}>Create Teacher Account</button></> : <>Already registered? <button className="font-medium underline" onClick={() => switchMode("signin")}>Login</button></>}</p>
  </div>;
}

function firebaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

const knownAuthErrorCodes = new Set([
  "auth/invalid-credential", "auth/invalid-login-credentials", "auth/user-not-found",
  "auth/wrong-password", "auth/too-many-requests", "auth/network-request-failed",
  "auth/operation-not-allowed", "auth/account-exists-with-different-credential",
  "auth/email-already-in-use", "auth/weak-password", "auth/popup-closed-by-user",
  "auth/popup-blocked", "auth/timeout", "auth/cancelled-popup-request",
]);

function logUnexpectedAuthError(code?: string) {
  if (!code || !knownAuthErrorCodes.has(code)) {
    // Firebase codes are useful for diagnosis; never log credentials, email, or raw error details.
    console.warn("Unexpected Firebase authentication failure", { code: code || "unknown" });
  }
}

export function authError(code?: string, registering = false): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password": return "The email or password is incorrect.";
    case "auth/user-not-found": return "No account was found for this email. Create a teacher account or check the email address.";
    case "auth/too-many-requests": return "Too many attempts. Wait a while and try again.";
    case "auth/account-exists-with-different-credential":
    case "auth/email-already-in-use": return "An account already uses this email. Sign in with its existing provider.";
    case "auth/weak-password": return "Choose a stronger password with at least 8 characters.";
    case "auth/popup-closed-by-user": return "Google sign-in was cancelled. You can try again when ready.";
    case "auth/popup-blocked": return "Your browser blocked the Google sign-in window. Allow popups and try again.";
    case "auth/operation-not-allowed": return "Email/Password authentication is disabled. Enable Email/Password in Firebase Console → Authentication → Sign-in method.";
    case "auth/network-request-failed": return "Network error. Check your connection and try again.";
    case "auth/timeout": return registering
      ? "Account creation is taking too long. Check your connection and account status before trying again."
      : "Sign-in is taking too long. Check your connection and try again.";
    case "auth/cancelled-popup-request": return "A Google sign-in request is already open. Finish or close it before trying again.";
    default: return registering ? "Registration could not be completed. Check your details and try again." : "Could not sign in. Check your details and try again.";
  }
}

function profileSetupError(error: { code?: string; message?: string }): string {
  const detail = error.message?.trim();
  switch (error.code) {
    case "profile/phone-required":
      return "Enter a valid phone number to finish your teacher profile.";
    case "profile/name-required":
      return "Enter your full name to finish your teacher profile.";
    case "profile/invalid-phone":
      return "Enter a valid phone number in international format.";
    case "profile/account-inactive":
      return "This teacher account is not active. Contact an administrator.";
    case "profile/role-mismatch":
      return "This account does not have a teacher profile. Contact an administrator.";
    case "profile/identity-mismatch":
      return "The existing profile does not match the signed-in Firebase account. Contact an administrator.";
    case "profile/invalid-account":
      return "Firebase did not provide the account details required to create a teacher profile.";
    case "profile/unsupported-provider":
      return "Use an email/password or Google account to access the teacher area.";
    case "profile/deadline-exceeded":
      return "Teacher profile setup timed out. Your sign-in remains active; check your connection and retry.";
    case "permission-denied":
    case "firestore/permission-denied":
      return "Firestore rules denied profile setup. Deploy the updated firestore.rules and retry.";
    case "not-found":
      return "Firestore could not find the teacher profile after setup. Check the profile and retry.";
    case "unavailable":
    case "deadline-exceeded":
      return `Firestore did not respond in time (${error.code}). Your sign-in is still active; retry profile setup.`;
    case "auth/timeout":
      return "Profile setup is taking too long. Your sign-in is still active; retry profile setup after checking the connection.";
    case "profile/role-not-confirmed":
    case "profile/not-ready":
      return "Firestore has not confirmed an active teacher profile. Check the user profile and rules, then retry.";
    case "auth/network-request-failed":
      return "A network request failed while setting up your profile. Check your connection and retry.";
    default:
      return `Teacher profile setup failed${error.code ? ` (${error.code})` : ""}${detail ? `: ${detail}` : ". Check Firestore permissions and retry."}`;
  }
}
