import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { getFirebaseConfigError, getMissingConfigKeys, isFirebaseConfigured } from "@/lib/firebase";

/**
 * Wraps the whole app. If the required Firebase environment variables are not
 * set, we show a clear developer-facing explanation instead of letting the
 * app crash with a cryptic Firebase SDK error.
 */
export function ConfigGate({ children }: { children: ReactNode }) {
  if (isFirebaseConfigured) return <>{children}</>;

  const missing = getMissingConfigKeys();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] p-6">
      <div className="w-full max-w-xl rounded-lg border border-[#D9DADD] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-[#303238]">
          <AlertTriangle className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Firebase is not configured yet</h1>
        </div>
        <p className="mt-3 text-sm text-[#747780]">
          ClassBoard needs a real Firebase project to run. Create a <code className="rounded bg-[#EEEEF0] px-1 py-0.5">.env</code>{" "}
          file in the project root (copy <code className="rounded bg-[#EEEEF0] px-1 py-0.5">.env.example</code>) and fill it
          with the values from <strong>Firebase Console → Project settings → General → Your apps</strong>.
        </p>
        <div className="mt-4 rounded-md border border-[#D9DADD] bg-[#F5F5F5] p-3">
          <p className="text-xs font-medium text-[#303238]">Missing variables:</p>
          <ul className="mt-1.5 space-y-0.5 font-mono text-xs text-[#747780]">
            {missing.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-sm text-[#747780]">
          {getFirebaseConfigError()} Also make sure you have created a <strong>Realtime Database</strong> instance (Build → Realtime
          Database → Create Database) for <code className="rounded bg-[#EEEEF0] px-1 py-0.5">VITE_FIREBASE_DATABASE_URL</code>,
          enabled <strong>Email/Password</strong> and <strong>Anonymous</strong> sign-in methods, and deployed the
          security rules in <code className="rounded bg-[#EEEEF0] px-1 py-0.5">firestore.rules</code>,{" "}
          <code className="rounded bg-[#EEEEF0] px-1 py-0.5">database.rules.json</code> and{" "}
          <code className="rounded bg-[#EEEEF0] px-1 py-0.5">storage.rules</code>. See{" "}
          <code className="rounded bg-[#EEEEF0] px-1 py-0.5">README.md</code> for the full setup guide.
        </p>
      </div>
    </div>
  );
}
