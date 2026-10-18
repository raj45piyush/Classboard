import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  Copy,
  Check,
  RefreshCw,
  Lock,
  Unlock,
  Archive,
  Plus,
  NotebookPen,
  Trash2,
  Users2,
  Pencil,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  subscribeClassroom,
  subscribeClassroomJoinCode,
  rotateJoinCode,
  setClassroomStatus,
  updateClassroomDetails,
} from "@/services/classrooms";
import { subscribeLessons, createLesson, setLessonPublished, deleteLesson } from "@/services/lessons";
import { subscribeMembers } from "@/services/members";
import { lessonFormSchema, classroomFormSchema, flattenZodError } from "@/utils/validation";
import type { Classroom, Lesson, ClassroomMember } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatRelativeTime, formatTimestamp } from "@/utils/format";

export default function ClassroomDetail() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const { profile } = useAuth();
  const [classroom, setClassroom] = useState<Classroom | null | undefined>(undefined);
  const [loadedClassroomId, setLoadedClassroomId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [members, setMembers] = useState<ClassroomMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatalLoadError, setFatalLoadError] = useState<string | null>(null);
  const [lessonsLoadFailed, setLessonsLoadFailed] = useState(false);
  const [membersLoadFailed, setMembersLoadFailed] = useState(false);
  const [shareCode, setShareCode] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<"closed" | "archived" | "active" | null>(null);
  const [showLessonForm, setShowLessonForm] = useState(false);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lesson | null>(null);

  useEffect(() => {
    if (!classroomId) return;
    setClassroom(undefined);
    setLoadedClassroomId(null);
    setLessons(null);
    setMembers(null);
    setError(null);
    setFatalLoadError(null);
    setLessonsLoadFailed(false);
    setMembersLoadFailed(false);
    return subscribeClassroom(classroomId, (value) => {
      setClassroom(value);
      setLoadedClassroomId(classroomId);
    }, (err) => {
      setFatalLoadError(firebaseAccessError("classroom details", err));
      setLoadedClassroomId(classroomId);
    });
  }, [classroomId]);

  useEffect(() => {
    if (!classroomId || loadedClassroomId !== classroomId || !profile?.uid || classroom?.teacherUid !== profile.uid) return;
    return subscribeLessons(classroomId, setLessons, (err) => {
      setLessonsLoadFailed(true);
      setError(firebaseAccessError("classroom lessons", err));
    });
  }, [classroomId, loadedClassroomId, classroom?.teacherUid, profile?.uid]);

  useEffect(() => {
    if (!classroomId || loadedClassroomId !== classroomId || !profile?.uid || classroom?.teacherUid !== profile.uid) return;
    setShareCode(undefined);
    return subscribeClassroomJoinCode(classroomId, setShareCode, (err) => {
      setShareCode(null);
      setError(firebaseAccessError("private classroom join code", err));
    }, classroom.joinCodeHash || undefined);
  }, [classroomId, loadedClassroomId, classroom?.teacherUid, classroom?.joinCodeHash, profile?.uid]);

  useEffect(() => {
    if (!classroomId || loadedClassroomId !== classroomId || !profile?.uid || classroom?.teacherUid !== profile.uid) return;
    return subscribeMembers(classroomId, setMembers, (err) => {
      setMembersLoadFailed(true);
      setError(firebaseAccessError("classroom member list", err));
    });
  }, [classroomId, loadedClassroomId, classroom?.teacherUid, profile?.uid]);

  if (!classroomId) return <Navigate to="/teacher" replace />;
  if (loadedClassroomId !== classroomId) return <Spinner label="Loading classroom…" />;
  if (fatalLoadError) return <div className="space-y-3"><Alert tone="error">{fatalLoadError}</Alert><Link className="text-sm underline" to="/teacher">Back to classrooms</Link></div>;
  if (classroom === null) return <EmptyState title="Classroom not found" description="It may have been deleted." />;
  if (classroom === undefined || !profile) return <Spinner label="Loading classroom…" />;
  if (classroom.teacherUid !== profile.uid) return <Navigate to="/unauthorized" replace />;

  const activeMembers = members?.filter((m) => m.accessStatus === "active") ?? [];

  async function handleRotate() {
    if (!classroomId || !classroom) return;
    try {
      const code = await rotateJoinCode(classroomId, classroom.joinCodeHash);
      setShareCode(code);
      setConfirmRotate(false);
    } catch (err) { setError(firebaseAccessError("joining code", err)); }
  }

  async function handleStatusChange(status: "closed" | "archived" | "active") {
    if (!classroomId) return;
    try { await setClassroomStatus(classroomId, status); setConfirmStatus(null); }
    catch (err) { setError(firebaseAccessError("classroom status", err)); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[#303238]">{classroom.title}</h1>
          {classroom.subject && <p className="text-sm text-[#747780]">{classroom.subject}</p>}
          {classroom.description && <p className="mt-1 max-w-2xl text-sm text-[#747780]">{classroom.description}</p>}
        </div>
        <Badge tone={classroom.status === "active" ? "success" : classroom.status === "closed" ? "warning" : "neutral"}>
          {classroom.status}
        </Badge>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-2 text-xs text-[#747780]">
        <span>Classroom ID</span><code className="select-all text-[#303238]">{classroom.id}</code>
        <Button variant="ghost" size="sm" onClick={async () => {
          try { await navigator.clipboard.writeText(classroom.id); setCopiedId(true); }
          catch { setError("Clipboard access failed. Select and copy the classroom ID."); }
        }}><Copy className="h-3.5 w-3.5" />{copiedId ? "Copied" : "Copy ID"}</Button>
        <Button variant="secondary" size="sm" onClick={() => setShowEditDetails((value) => !value)}><Pencil className="h-3.5 w-3.5" />Edit details</Button>
      </div>

      {showEditDetails && <EditClassroomDetails
        classroom={classroom}
        onSave={async (patch) => {
          await updateClassroomDetails(classroom.id, patch);
          setShowEditDetails(false);
        }}
        onCancel={() => setShowEditDetails(false)}
      />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#303238]">Joining code</span>
          </CardHeader>
          <CardBody>
            {shareCode ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border border-[#D9DADD] bg-[#F5F5F5] px-4 py-3">
                  <span className="font-mono text-2xl tracking-widest text-[#303238]">{shareCode}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareCode);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch { setError("Clipboard access failed. Select and copy the join code."); }
                    }}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-[#747780]">Shareable link: <code className="break-all">{`${window.location.origin}/join?code=${shareCode}`}</code></p>
                <Button variant="secondary" size="sm" onClick={async () => {
                  try { await navigator.clipboard.writeText(`${window.location.origin}/join?code=${shareCode}`); setCopied(true); }
                  catch { setError("Clipboard access failed. Copy the link shown above."); }
                }}><Copy className="h-4 w-4" />Copy joining link</Button>
              </div>
            ) : shareCode === undefined ? (
              <Spinner label="Loading the active join code…" />
            ) : (
              <Alert tone="info">This classroom predates private code recovery. Rotate the code to create and display a new active share code.</Alert>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmRotate(true)}>
                <RefreshCw className="h-4 w-4" />
                Rotate code
              </Button>
              {classroom.status === "active" ? (
                <Button variant="secondary" size="sm" onClick={() => setConfirmStatus("closed")}>
                  <Lock className="h-4 w-4" />
                  Close classroom
                </Button>
              ) : classroom.status === "closed" ? (
                <Button variant="secondary" size="sm" onClick={() => setConfirmStatus("active")}>
                  <Unlock className="h-4 w-4" />
                  Reopen classroom
                </Button>
              ) : null}
              {classroom.status !== "archived" && (
                <Button variant="secondary" size="sm" onClick={() => setConfirmStatus("archived")}>
                  <Archive className="h-4 w-4" />
                  Archive
                </Button>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-1.5">
            <Users2 className="h-4 w-4 text-[#303238]" />
            <span className="text-sm font-medium text-[#303238]">Members ({activeMembers.length})</span>
          </CardHeader>
          <CardBody className="max-h-48 overflow-y-auto">
            {members === null && !membersLoadFailed && <Spinner label="Loading…" />}
            {membersLoadFailed && <p className="text-sm text-[#747780]">The member list could not be loaded.</p>}
            {members !== null && !membersLoadFailed && activeMembers.length === 0 && (
              <p className="text-sm text-[#747780]">No students have joined yet.</p>
            )}
            <ul className="space-y-1.5">
              {activeMembers.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-[#303238]">{m.displayName}</span>
                  <span className="text-xs text-[#9a9ca3]">{formatRelativeTime(m.lastSeenAt)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#303238]">Lessons</h2>
        <Button size="sm" onClick={() => setShowLessonForm((v) => !v)}>
          <Plus className="h-4 w-4" />
          New lesson
        </Button>
      </div>

      {showLessonForm && (
        <NewLessonForm
          classroomId={classroomId}
          teacherUid={classroom.teacherUid}
          classroomTitle={classroom.title}
          onDone={() => setShowLessonForm(false)}
        />
      )}

      {lessons === null && !lessonsLoadFailed && <Spinner label="Loading lessons…" />}
      {lessonsLoadFailed && <p className="text-sm text-[#747780]">Lessons could not be loaded. Check the access message above.</p>}
      {lessons !== null && lessons.length === 0 && (
        <EmptyState icon={<NotebookPen className="h-6 w-6" />} title="No lessons yet" description="Create a lesson to open the whiteboard." />
      )}

      <div className="space-y-2">
        {lessons?.map((lesson) => (
          <Card key={lesson.id}>
            <CardBody className="flex items-center justify-between">
              <div>
                <Link to={`/teacher/class/${classroomId}/board/${lesson.id}`} className="font-medium text-[#303238] hover:underline">
                  {lesson.title}
                </Link>
                <p className="text-xs text-[#747780]">
                  {lesson.pageCount} page{lesson.pageCount === 1 ? "" : "s"} · updated {formatTimestamp(lesson.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={lesson.published ? "success" : "neutral"}>{lesson.published ? "Published" : "Draft"}</Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setLessonPublished(classroomId, lesson.id, !lesson.published).catch((err) => setError(firebaseAccessError("lesson publishing", err)))}
                >
                  {lesson.published ? "Unpublish" : "Publish"}
                </Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget(lesson)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={confirmRotate}
        title="Rotate joining code?"
        description="The current code will stop working immediately. Students using it will need the new one."
        confirmLabel="Rotate"
        onConfirm={handleRotate}
        onCancel={() => setConfirmRotate(false)}
      />
      <ConfirmDialog
        open={confirmStatus !== null}
        title={
          confirmStatus === "archived"
            ? "Archive this classroom?"
            : confirmStatus === "closed"
              ? "Close this classroom?"
              : "Reopen this classroom?"
        }
        description={
          confirmStatus === "archived"
            ? "Archived classrooms are hidden from students and can't be reopened automatically."
            : confirmStatus === "closed"
              ? "Students won't be able to view the live board or join while closed."
              : "Students will be able to join and view the board again."
        }
        confirmLabel="Confirm"
        danger={confirmStatus === "archived" || confirmStatus === "closed"}
        onConfirm={() => confirmStatus && handleStatusChange(confirmStatus)}
        onCancel={() => setConfirmStatus(null)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This permanently removes the lesson and all of its saved pages."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          try {
            if (deleteTarget) await deleteLesson(classroomId, deleteTarget.id);
            setDeleteTarget(null);
          } catch (err) { setError(firebaseAccessError("lesson deletion", err)); }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function firebaseAccessError(resource: string, error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "permission-denied" || code === "firestore/permission-denied") {
    return `Firebase denied access to ${resource}. Confirm this account is an active teacher who owns this classroom, then deploy the current firestore.rules.`;
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return `Firebase could not load ${resource} because the service or network is unavailable. Retry when the connection is stable.`;
  }
  return `Could not load or update ${resource}. Check the connection and try again${code ? ` (${code})` : ""}.`;
}

function EditClassroomDetails({ classroom, onSave, onCancel }: {
  classroom: Classroom;
  onSave: (patch: { title: string; subject: string; description: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(classroom.title);
  const [subject, setSubject] = useState(classroom.subject);
  const [description, setDescription] = useState(classroom.description);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    const parsed = classroomFormSchema.safeParse({ title, subject, description });
    if (!parsed.success) return setError(flattenZodError(parsed.error));
    setBusy(true);
    try { await onSave(parsed.data); }
    catch { setError("Classroom details could not be saved. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <Card><CardBody><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
    {error && <div className="sm:col-span-2"><Alert tone="error">{error}</Alert></div>}
    <div><Label htmlFor="edit-class-title">Classroom name</Label><Input id="edit-class-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
    <div><Label htmlFor="edit-class-subject">Subject</Label><Input id="edit-class-subject" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
    <div className="sm:col-span-2"><Label htmlFor="edit-class-description">Description</Label><Input id="edit-class-description" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
    <div className="flex gap-2 sm:col-span-2"><Button type="submit" loading={busy}>Save details</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
  </form></CardBody></Card>;
}

function NewLessonForm({
  classroomId,
  teacherUid,
  classroomTitle,
  onDone,
}: {
  classroomId: string;
  teacherUid: string;
  classroomTitle: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const result = lessonFormSchema.safeParse({ title, description, boardMode: "blank" });
    if (!result.success) {
      setError(flattenZodError(result.error));
      return;
    }
    setSubmitting(true);
    try {
      await createLesson(classroomId, { title: result.data.title, description: result.data.description, boardMode: "blank", teacherUid, classroomTitle });
      onDone();
    } catch (err) {
      console.error(err);
      setError("Could not create the lesson.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3" noValidate>
          {error && (
            <div className="w-full">
              <Alert tone="error">{error}</Alert>
            </div>
          )}
          <div className="flex-1">
            <Label htmlFor="lesson-title">Lesson title</Label>
            <Input id="lesson-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Newton's laws of motion" />
          </div>
          <div className="flex-1">
            <Label htmlFor="lesson-description">Description</Label>
            <Input id="lesson-description" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional summary for students" />
          </div>
          <Button type="submit" loading={submitting}>
            Create
          </Button>
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
