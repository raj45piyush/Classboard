import { GoogleAuthProvider, linkWithPopup, type User } from "firebase/auth";
import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function GoogleSignInButton({ onClick, loading = false }: { onClick: () => void; loading?: boolean }) {
  return <Button type="button" variant="secondary" className="w-full" loading={loading} onClick={onClick}>
    <GoogleMark /> Continue with Google
  </Button>;
}

export function GoogleProviderLink({ user }: { user: User }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linked = user.providerData.some((provider) => provider.providerId === "google.com");

  async function linkGoogle() {
    setBusy(true); setMessage(null); setError(null);
    try {
      await linkWithPopup(user, new GoogleAuthProvider());
      setMessage("Google sign-in is linked to this account.");
    } catch (err: any) {
      setError(err?.code === "auth/credential-already-in-use" || err?.code === "auth/account-exists-with-different-credential"
        ? "This Google account belongs to another ClassBoard account. Sign in to that account; Firebase does not merge accounts automatically."
        : "Google could not be linked. Try again or sign in using your current method.");
    } finally { setBusy(false); }
  }

  return <div className="space-y-2 rounded-lg border border-[#D9DADD] bg-white p-4">
    <p className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4" />Sign-in methods</p>
    <p className="text-xs text-[#747780]">Link Google while signed in to use it with this same account.</p>
    {error && <Alert tone="error">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}
    {!linked && <Button variant="secondary" size="sm" loading={busy} onClick={linkGoogle}>Link Google account</Button>}
  </div>;
}

function GoogleMark() {
  return <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.39-4.55H24v9.02h12.91c-.58 2.96-2.26 5.48-4.71 7.18l7.27 5.64c4.24-3.91 6.69-9.68 6.69-17.29Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.94 23.94 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.27-5.64c-2.02 1.35-4.6 2.14-8.63 2.14-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;
}
