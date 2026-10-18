import { useEffect, useMemo, useState } from "react";
import { Search, Users2, UserX } from "lucide-react";
import { removeClassroomMember, subscribeAllClassrooms } from "@/services/admin";
import { setClassroomStatus } from "@/services/classrooms";
import { subscribeMembers } from "@/services/members";
import type { Classroom, ClassroomStatus, ClassroomMember } from "@/types";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatTimestamp } from "@/utils/format";
import { Button } from "@/components/ui/Button";
import { trustedFunctionsEnabled } from "@/lib/backendFeatures";

const PAGE_SIZE = 8;
const STATUS_FILTERS: Array<ClassroomStatus | "all"> = ["all", "active", "closed", "archived"];

export default function AdminClassrooms() {
  const [classrooms, setClassrooms] = useState<Classroom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClassroomStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeAllClassrooms(setClassrooms, (err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    if (!classrooms) return [];
    const term = search.trim().toLowerCase();
    return classrooms.filter((c) => {
      const matchesTerm =
        !term || c.title.toLowerCase().includes(term) || c.teacherName.toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesTerm && matchesStatus;
    });
  }, [classrooms, search, statusFilter]);

  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-[#303238]">Classrooms</h1>
        <p className="text-sm text-[#747780]">Every classroom across all teachers, with ownership and status.</p>
      </div>

      {!trustedFunctionsEnabled && <Alert tone="info">Removing an individual classroom member is temporarily unavailable.</Alert>}

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[#9a9ca3]" />
          <Input
            placeholder="Search by title or teacher"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="flex gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(0);
              }}
              className={`rounded-md border px-2.5 py-1.5 text-xs capitalize ${
                statusFilter === s
                  ? "border-[#303238] bg-[#303238] text-white"
                  : "border-[#D9DADD] text-[#747780] hover:bg-[#EEEEF0]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {classrooms === null && <Spinner label="Loading classrooms…" />}
      {classrooms !== null && filtered.length === 0 && (
        <EmptyState title="No classrooms found" description="Try a different search or filter." />
      )}

      <div className="space-y-2">
        {pageItems.map((c) => (
          <Card key={c.id}>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-[#303238]">{c.title}</p>
                <p className="text-xs text-[#747780]">
                  {c.subject ? `${c.subject} · ` : ""}Owned by {c.teacherName || "unknown teacher"}
                </p>
                {c.description && <p className="mt-1 max-w-xl text-xs text-[#747780]">{c.description}</p>}
                <p className="text-xs text-[#9a9ca3]">Created {formatTimestamp(c.createdAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={c.status === "active" ? "success" : c.status === "closed" ? "warning" : "neutral"}>{c.status}</Badge>
                <Button size="sm" variant="secondary" onClick={async () => {
                  setActionError(null);
                  try { await setClassroomStatus(c.id, c.status === "active" ? "closed" : "active"); }
                  catch { setActionError(`Could not update access for “${c.title}”.`); }
                }}>{c.status === "active" ? "Close access" : "Reopen"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}><Users2 className="h-4 w-4" />Members</Button>
              </div>
            </CardBody>
            {expandedId === c.id && <AdminMemberList classroomId={c.id} />}
          </Card>
        ))}
      </div>

      {actionError && <Alert tone="error">{actionError}</Alert>}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded px-2 py-1 text-[#747780] hover:bg-[#EEEEF0] disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-[#747780]">
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="rounded px-2 py-1 text-[#747780] hover:bg-[#EEEEF0] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function AdminMemberList({ classroomId }: { classroomId: string }) {
  const [members, setMembers] = useState<ClassroomMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  useEffect(() => subscribeMembers(classroomId, setMembers, (err) => setError(err.message)), [classroomId]);
  return <div className="border-t border-[#D9DADD] px-4 py-3">
    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Users2 className="h-4 w-4" />Membership</h3>
    {error && <Alert tone="error">Could not load this classroom's members. Check the admin role and rules.</Alert>}
    {members === null && <Spinner label="Loading members…" />}
    {members?.length === 0 && <p className="text-sm text-[#747780]">No membership records.</p>}
    <ul className="space-y-2">{members?.map((member) => <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>{member.displayName} <span className="text-xs text-[#747780]">· {member.accessStatus}</span></span>
      {member.accessStatus === "active" && <Button size="sm" variant="secondary" disabled={!trustedFunctionsEnabled} loading={busyUid === member.id} onClick={async () => {
        setError(null); setBusyUid(member.id);
        try { await removeClassroomMember(classroomId, member.sessionUid); }
        catch { setError(`Could not revoke ${member.displayName}'s access. Try again.`); }
        finally { setBusyUid(null); }
      }}><UserX className="h-4 w-4" />Revoke access</Button>}
    </li>)}</ul>
  </div>;
}
