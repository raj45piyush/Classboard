import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { requestPasswordReset } from "@/services/auth";
import { emailSchema, flattenZodError } from "@/utils/validation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); setError(null); setSent(false);
    const result = emailSchema.safeParse(email);
    if (!result.success) return setError(flattenZodError(result.error));
    setBusy(true);
    try { await requestPasswordReset(result.data); setSent(true); }
    catch (err: any) {
      if (err?.code === "auth/user-not-found" || err?.code === "auth/invalid-email") setSent(true);
      else if (err?.code === "auth/too-many-requests") setError("Too many requests. Wait a while and try again.");
      else setError("The reset email could not be sent. Check your address and try again.");
    } finally { setBusy(false); }
  }

  return <div className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10"><Card className="w-full"><CardBody className="space-y-4">
    <div className="flex items-center gap-2"><KeyRound className="h-5 w-5" /><h1 className="text-lg font-semibold">Reset your password</h1></div>
    <p className="text-sm text-[#747780]">Enter the email used for your account. If it can be reset, Firebase will send a secure reset link. Google-only users should use Google account recovery.</p>
    {error && <Alert tone="error">{error}</Alert>}{sent && <Alert tone="success">If an account can be reset, a link is on its way. Check your inbox.</Alert>}
    <form className="space-y-3" onSubmit={handleSubmit}><div><Label htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div><Button className="w-full" type="submit" loading={busy}>Send reset email</Button></form>
    <Link className="block text-center text-sm underline" to="/auth/teacher?mode=signin">Back to teacher sign in</Link>
    <Link className="block text-center text-xs text-[#747780] underline" to="/login/admin">Admin sign in</Link>
  </CardBody></Card></div>;
}
