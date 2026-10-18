import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Search, UserPlus, UserX, UserCheck2, Pencil, Copy, Mail } from "lucide-react";
import { subscribeAllTeachers, setTeacherStatus, updateTeacherProfile } from "@/services/admin";
import { teacherAccountSchema, flattenZodError } from "@/utils/validation";
import type { UserProfile } from "@/types";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatTimestamp } from "@/utils/format";
import { PhoneNumberField } from "@/components/auth/PhoneNumberField";

const PAGE_SIZE = 8;

function operationError(error: unknown, action: string) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code.includes("permission-denied")) return `You are not authorized to ${action}.`;
  if (code.includes("unavailable") || code.includes("network")) return `The service is unavailable. Check your connection and retry ${action}.`;
  return `Could not ${action}. Check the details and your connection, then try again.`;
}

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<UserProfile | null>(null);
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<{ displayName: string; email: string; phoneNumber: string; link: string } | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => subscribeAllTeachers(setTeachers, (err) => setError(err.message)), []);

  const filtered = useMemo(() => {
    if (!teachers) return [];
    const term = search.trim().toLowerCase();
    if (!term) return teachers;
    return teachers.filter((t) => t.displayName.toLowerCase().includes(term)
      || (t.email ?? "").toLowerCase().includes(term)
      || (t.phoneNumber ?? "").toLowerCase().includes(term));
  }, [teachers, search]);

  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  async function handleToggleStatus(teacher: UserProfile) {
    if (busyUid || !["active", "disabled"].includes(teacher.status)) return;
    const nextStatus = teacher.status === "active" ? "disabled" : "active";
    setBusyUid(teacher.uid);
    setError(null);
    setNotice(null);
    try {
      await setTeacherStatus(teacher.uid, nextStatus);
      setConfirmTarget(null);
      setNotice(nextStatus === "active"
        ? "Teacher profile activated. Firestore and Storage access is restored."
        : "Teacher profile deactivated. Firestore and Storage access is denied; this does not revoke Firebase Auth sessions or existing claim-based Realtime Database access.");
    } catch (err) {
      setError(operationError(err, "update teacher access"));
    } finally {
      setBusyUid(null);
    }
  }

  function invitationPrepared(details: { displayName: string; email: string; phoneNumber: string; link: string }) {
    setShowCreate(false);
    setInvitation(details);
    setNotice(`Registration invitation prepared for ${details.email}. No account is created until the teacher completes self-registration.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[#303238]">Teachers</h1>
          <p className="text-sm text-[#747780]">Review teacher profiles and manage ClassBoard access.</p>
        </div>
        <Button onClick={() => { setError(null); setInvitation(null); setShowCreate((value) => !value); }}>
          <UserPlus className="h-4 w-4" /> Prepare invitation
        </Button>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {invitation && <InvitationPanel invitation={invitation} onDismiss={() => setInvitation(null)} />}
      {showCreate && <CreateTeacherForm onDone={() => setShowCreate(false)} onPrepared={invitationPrepared} />}
      {editTarget && <EditTeacherForm teacher={editTarget} onDone={() => setEditTarget(null)} onSaved={() => {
        setEditTarget(null);
        setNotice("Teacher profile updated.");
      }} />}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[#9a9ca3]" />
        <Input aria-label="Search teachers" placeholder="Search by name, email or phone" className="pl-8" value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
      </div>

      {teachers === null && <Spinner label="Loading teachers…" />}
      {teachers !== null && teachers.length === 0 && <EmptyState title="No teacher profiles yet" description="Prepare an invitation and ask the teacher to complete self-registration." />}

      <div className="space-y-2">
        {pageItems.map((teacher) => (
          <Card key={teacher.uid}>
            <CardBody className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium text-[#303238]">{teacher.displayName || "Unnamed teacher"}</p>
                <p className="text-xs text-[#747780]">{teacher.email || teacher.phoneNumber || "No contact information"}</p>
                {teacher.phoneNumber && teacher.email && <p className="text-xs text-[#747780]">{teacher.phoneNumber}</p>}
                <p className="text-xs text-[#9a9ca3]">Joined {formatTimestamp(teacher.createdAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setError(null); setEditTarget(teacher); }}><Pencil className="h-4 w-4" />Edit profile</Button>
                <Badge tone={teacher.status === "active" ? "success" : teacher.status === "pending" ? "neutral" : "danger"}>
                  {teacher.status === "pending" ? "Pending setup" : teacher.status}
                </Badge>
                {teacher.status === "pending" ? <span className="text-xs text-[#747780]">Complete teacher registration before activation.</span> : (
                  <Button variant="secondary" size="sm" disabled={busyUid !== null} onClick={() => setConfirmTarget(teacher)}>
                    {teacher.status === "active" ? <UserX className="h-4 w-4" /> : <UserCheck2 className="h-4 w-4" />}
                    {teacher.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {filtered.length > PAGE_SIZE && <div className="flex items-center justify-center gap-2 text-sm">
        <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button>
        <span className="text-[#747780]">Page {page + 1} of {totalPages}</span>
        <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((value) => value + 1)}>Next</Button>
      </div>}

      <ConfirmDialog
        open={confirmTarget !== null}
        title={confirmTarget?.status === "active" ? "Deactivate this teacher?" : "Activate this teacher?"}
        description={confirmTarget?.status === "active"
          ? "Firestore and Storage operations that check active status will be denied. This does not revoke the Firebase Authentication session. Existing Realtime Database access may remain valid while a teacher custom claim is present; full revocation needs trusted backend support."
          : "This restores ClassBoard Firestore and Storage access for this teacher profile."}
        confirmLabel={busyUid ? "Updating…" : "Confirm"}
        danger={confirmTarget?.status === "active"}
        onConfirm={() => { if (confirmTarget) void handleToggleStatus(confirmTarget); }}
        onCancel={() => { if (!busyUid) setConfirmTarget(null); }}
      />
    </div>
  );
}

function InvitationPanel({ invitation, onDismiss }: { invitation: { displayName: string; email: string; phoneNumber: string; link: string }; onDismiss: () => void }) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const mailto = `mailto:${encodeURIComponent(invitation.email)}?subject=${encodeURIComponent("ClassBoard teacher registration")}&body=${encodeURIComponent(`Hello ${invitation.displayName},\n\nPlease create your ClassBoard teacher account using this registration page:\n${invitation.link}\n\nRegister with ${invitation.email} and use your contact number ${invitation.phoneNumber}.`)}`;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invitation.link);
      setCopyMessage("Registration link copied.");
    } catch {
      setCopyMessage("Could not copy automatically. Select and copy the link above.");
    }
  }
  return <Card><CardBody className="space-y-2 text-sm">
    <p className="font-medium">Registration invitation</p>
    <p className="text-[#747780]">The teacher must complete registration to create their Firebase Authentication account and teacher profile. This page does not create an account or send email automatically.</p>
    <p className="text-xs text-[#747780]">Prepared for {invitation.displayName} · {invitation.email} · {invitation.phoneNumber}</p>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input readOnly value={invitation.link} aria-label="Teacher registration link" />
      <Button type="button" variant="secondary" onClick={() => void copyLink()}><Copy className="h-4 w-4" />Copy link</Button>
      <a className="inline-flex items-center justify-center gap-2 rounded-md border border-[#D9DADD] bg-white px-3.5 py-2 text-sm font-medium text-[#303238] hover:bg-[#EEEEF0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#303238]" href={mailto}><Mail className="h-4 w-4" />Draft email</a>
      <Button type="button" variant="ghost" onClick={onDismiss}>Dismiss</Button>
    </div>
    {copyMessage && <p role="status" className="text-xs text-[#747780]">{copyMessage}</p>}
  </CardBody></Card>;
}

function EditTeacherForm({ teacher, onDone, onSaved }: { teacher: UserProfile; onDone: () => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(teacher.displayName);
  const [phoneNumber, setPhoneNumber] = useState(teacher.phoneNumber || "+91");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const validated = teacherAccountSchema.safeParse({ displayName, email: teacher.email || "", phoneNumber });
    if (!validated.success) { setError(flattenZodError(validated.error)); return; }
    setBusy(true);
    try {
      await updateTeacherProfile({ uid: teacher.uid, displayName: validated.data.displayName, phoneNumber: validated.data.phoneNumber });
      onSaved();
    } catch (err) {
      setError(operationError(err, "save this teacher profile"));
    } finally {
      setBusy(false);
    }
  }

  return <Card><CardBody><form onSubmit={submit} className="space-y-3" noValidate>
    <h2 className="font-semibold">Edit teacher profile</h2>
    {error && <Alert tone="error">{error}</Alert>}
    <div><Label htmlFor="edit-teacher-name">Full name</Label><Input id="edit-teacher-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div>
    <div><Label htmlFor="edit-teacher-email">Email</Label><Input id="edit-teacher-email" disabled value={teacher.email || ""} /></div>
    <PhoneNumberField value={phoneNumber} onChange={setPhoneNumber} />
    <p className="text-xs text-[#747780]">Email and role cannot be changed here. The phone number is not SMS verified.</p>
    <div className="flex gap-2"><Button type="submit" loading={busy}>Save profile</Button><Button type="button" variant="secondary" disabled={busy} onClick={onDone}>Cancel</Button></div>
  </form></CardBody></Card>;
}

function CreateTeacherForm({ onDone, onPrepared }: { onDone: () => void; onPrepared: (details: { displayName: string; email: string; phoneNumber: string; link: string }) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+91");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const result = teacherAccountSchema.safeParse({ displayName, email, phoneNumber });
    if (!result.success) {
      setError(flattenZodError(result.error));
      return;
    }
    const link = new URL("/auth/teacher?mode=register", window.location.origin).toString();
    onPrepared({ ...result.data, link });
  }

  return <Card><CardBody><form onSubmit={handleSubmit} className="space-y-3" noValidate>
    <h2 className="font-semibold">Prepare a teacher invitation</h2>
    {error && <Alert tone="error">{error}</Alert>}
    <p className="text-sm text-[#747780]">Firebase Spark does not provide a trusted server here to create another user’s Authentication account. Share a registration link; the teacher creates their own account through the protected self-registration flow.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor="t-name">Full name</Label><Input id="t-name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div>
      <div><Label htmlFor="t-email">Email</Label><Input id="t-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
    </div>
    <PhoneNumberField value={phoneNumber} onChange={setPhoneNumber} />
    <p className="text-xs text-[#747780]">Name and phone are for the invitation only; they are not written to a profile until the teacher registers.</p>
    <div className="flex gap-2"><Button type="submit">Prepare invitation</Button><Button type="button" variant="secondary" onClick={onDone}>Cancel</Button></div>
  </form></CardBody></Card>;
}
