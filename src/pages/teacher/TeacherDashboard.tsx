import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Copy, Check, School, Link2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { subscribeTeacherClassrooms, createClassroom } from "@/services/classrooms";
import { classroomFormSchema, flattenZodError } from "@/utils/validation";
import type { Classroom } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { formatTimestamp } from "@/utils/format";
import { GoogleProviderLink } from "@/components/auth/TeacherAuthOptions";

export default function TeacherDashboard() {
  const { profile, firebaseUser } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const unsub = subscribeTeacherClassrooms(
      profile.uid,
      (list) => setClassrooms(list),
      (err) => setError("code" in err && err.code === "permission-denied"
        ? "Firestore denied your classroom list. Confirm your account has an active teacher profile and deploy the current firestore.rules."
        : "Your classrooms could not be loaded. Check the connection and try again.")
    );
    return unsub;
  }, [profile]);

  return (
    <div className="space-y-4">
      {profile && firebaseUser && <GoogleProviderLink user={firebaseUser} />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[#303238]">Your classrooms</h1>
          <p className="text-sm text-[#747780]">Create a classroom to get a joining code for your students.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" />
          New classroom
        </Button>
      </div>

      {showForm && profile && (
        <CreateClassroomForm
          teacherUid={profile.uid}
          teacherName={profile.displayName || profile.email || "Teacher"}
          onDone={() => setShowForm(false)}
        />
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {classrooms === null && <Spinner label="Loading classrooms…" />}

      {classrooms !== null && classrooms.length === 0 && (
        <EmptyState
          icon={<School className="h-6 w-6" />}
          title="No classrooms yet"
          description="Create your first classroom to start teaching with the live whiteboard."
        />
      )}

      {classrooms && classrooms.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classrooms.map((c) => (
            <Link key={c.id} to={`/teacher/class/${c.id}`}>
              <Card className="h-full transition-colors hover:border-[#303238]">
                <CardBody>
                  <div className="flex items-start justify-between">
                    <h2 className="font-medium text-[#303238]">{c.title}</h2>
                    <Badge tone={c.status === "active" ? "success" : c.status === "closed" ? "warning" : "neutral"}>
                      {c.status}
                    </Badge>
                  </div>
                  {c.subject && <p className="mt-0.5 text-sm text-[#747780]">{c.subject}</p>}
                  <p className="mt-3 text-xs text-[#9a9ca3]">Created {formatTimestamp(c.createdAt)}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateClassroomForm({
  teacherUid,
  teacherName,
  onDone,
}: {
  teacherUid: string;
  teacherName: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdClassroomId, setCreatedClassroomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [description, setDescription] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const result = classroomFormSchema.safeParse({ title, subject, description });
    if (!result.success) {
      setError(flattenZodError(result.error));
      return;
    }
    setSubmitting(true);
    try {
      const { classroomId, joinCode } = await createClassroom({
        title: result.data.title,
        subject: result.data.subject,
        description: result.data.description,
        teacherUid,
        teacherName,
      });
      setCreatedCode(joinCode);
      setCreatedClassroomId(classroomId);
    } catch (err) {
      const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
      setError(code === "permission-denied"
        ? "Firestore denied classroom creation. Confirm your active teacher profile and deploy the current firestore.rules."
        : "Could not create the classroom. Check the connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (createdCode) {
    return (
      <Card>
        <CardBody className="space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          <Alert tone="success">Classroom created. Share this code or its joining link with your students.</Alert>
          <div className="flex items-center justify-between rounded-md border border-[#D9DADD] bg-[#F5F5F5] px-4 py-3">
            <span className="font-mono text-2xl tracking-widest text-[#303238]">{createdCode}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(createdCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          {createdClassroomId && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#747780]">Classroom ID</span>
              <code className="break-all text-xs text-[#303238]">{createdClassroomId}</code>
              <Button variant="secondary" size="sm" onClick={async () => {
                try { await navigator.clipboard.writeText(createdClassroomId); setCopiedId(true); }
                catch { setError("Clipboard access failed. Select and copy the classroom ID."); }
              }}><Copy className="h-4 w-4" />{copiedId ? "Copied" : "Copy ID"}</Button>
              <span className="text-xs text-[#747780]">Joining link</span>
              <code className="min-w-0 flex-1 break-all text-xs text-[#303238]">{`${window.location.origin}/join?code=${createdCode}`}</code>
              <Button variant="secondary" size="sm" onClick={async () => {
                try { await navigator.clipboard.writeText(`${window.location.origin}/join?code=${createdCode}`); setCopiedLink(true); }
                catch { setError("Clipboard access failed. Copy the joining link shown above."); }
              }}><Link2 className="h-4 w-4" />{copiedLink ? "Copied" : "Copy link"}</Button>
            </div>
          )}
          <p className="text-xs text-[#747780]">
            This code is shown only once. You can always generate a new one later from the classroom page.
          </p>
          <Button variant="secondary" size="sm" onClick={onDone}>
            Done
          </Button>
          {createdClassroomId && <Link to={`/teacher/class/${createdClassroomId}`} className="inline-flex rounded-md bg-[#303238] px-3 py-2 text-sm font-medium text-white hover:bg-[#202126]">Open classroom</Link>}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Grade 10 - Section A" />
            </div>
            <div>
              <Label htmlFor="subject">Subject (optional)</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Physics" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="class-description">Description (optional)</Label>
              <Input id="class-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="A short note about this classroom" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" loading={submitting}>
              Create classroom
            </Button>
            <Button type="button" variant="secondary" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
