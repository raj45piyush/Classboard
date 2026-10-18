import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { signInAnonymously } from "firebase/auth";
import { Users } from "lucide-react";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { joinClassroomByCode } from "@/services/members";
import { joinClassroomSchema, flattenZodError } from "@/utils/validation";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";

export default function JoinClassroom() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const sharedCode = searchParams.get("code");
    if (sharedCode !== null) setCode(sharedCode.trim().toUpperCase());
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const result = joinClassroomSchema.safeParse({ code, displayName });
    if (!result.success) {
      setError(flattenZodError(result.error));
      return;
    }

    setSubmitting(true);
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      const classroomId = await joinClassroomByCode(result.data.code, result.data.displayName);
      navigate(`/student/${classroomId}`);
    } catch (err: any) {
      if (err?.code === "join/not-found" || err?.code === "join/lookup-denied") {
        setError("That code was not found or is no longer active. It may be invalid, expired, or rotated; ask your teacher for the current join code.");
      }
      else if (err?.code === "join/membership-denied" || err?.code === "permission-denied") {
        setError("Firebase denied adding your membership. Confirm the classroom is open and ask your teacher to check the deployed Firestore rules.");
      }
      else if (err?.code === "auth/unauthenticated") setError("Your session expired. Reload the page and try again.");
      else setError("Could not join this classroom. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardBody>
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-[#303238]" />
            <h1 className="text-lg font-semibold text-[#303238]">Join a classroom</h1>
          </div>

          {!isFirebaseConfigured && (
            <Alert tone="error">Firebase isn't configured yet, so joining won't work in this preview.</Alert>
          )}
          <form onSubmit={handleSubmit} className="mt-3 space-y-3" noValidate>
            {error && <Alert tone="error">{error}</Alert>}
            <div>
              <Label htmlFor="join-code">Classroom code</Label>
              <Input
                id="join-code"
                placeholder="16-character student join code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={64}
                className="tracking-widest"
                autoComplete="off"
                aria-describedby="join-code-help"
              />
              <p id="join-code-help" className="mt-1 text-xs text-[#747780]">
                Enter the share code from your teacher, not the Firestore classroom ID. Codes use 16 characters and omit I, O, 0, and 1.
              </p>
            </div>
            <div>
              <Label htmlFor="display-name">Your name</Label>
              <Input
                id="display-name"
                placeholder="How your teacher should see you"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <Button type="submit" className="w-full" loading={submitting} disabled={!isFirebaseConfigured}>
              Join classroom
            </Button>
          </form>
          <p className="mt-4 text-xs text-[#747780]">
            No account needed. You'll join as a read-only viewer of the live board.
          </p>
          <Link to="/" className="mt-3 block text-xs text-[#747780] underline">
            Back to home
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
