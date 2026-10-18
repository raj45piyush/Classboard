import { useEffect, useState } from "react";
import { RefreshCw, Users2, School, UserCheck, Activity } from "lucide-react";
import { fetchAdminStats, type AdminStats } from "@/services/admin";
import { subscribeRecentActivity } from "@/services/activity";
import type { ActivityLog } from "@/types";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatTimestamp } from "@/utils/format";
import { describeActivity } from "@/utils/activityLabels";

export default function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [activity, setActivity] = useState<ActivityLog[] | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  async function loadStats() {
    setLoadingStats(true);
    setError(null);
    try {
      const result = await fetchAdminStats();
      setStats(result);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error(err);
      setError("Could not load statistics. Check that you are signed in as an admin and Firestore rules are deployed.");
    } finally {
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    return subscribeRecentActivity(15, setActivity, () => setActivity([]));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[#303238]">Overview</h1>
          <p className="text-sm text-[#747780]">
            {lastRefreshed ? `Counts as of ${lastRefreshed.toLocaleTimeString()}` : "Loading real counts from Firestore…"}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadStats} loading={loadingStats}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<UserCheck className="h-5 w-5" />} label="Active teachers" value={stats?.activeTeachers} />
        <StatCard icon={<School className="h-5 w-5" />} label="Classrooms" value={stats?.totalClassrooms} />
        <StatCard
          icon={<Users2 className="h-5 w-5" />}
          label="Membership records"
          value={stats?.totalMemberships}
          hint="One record per student and classroom."
        />
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-base font-semibold text-[#303238]">
          <Activity className="h-4 w-4" />
          Recent activity
        </h2>
        {activity === null && <Spinner label="Loading activity…" />}
        {activity !== null && activity.length === 0 && (
          <EmptyState title="No activity yet" description="Actions like creating classrooms or joining will show up here." />
        )}
        <div className="space-y-1.5">
          {activity?.map((log) => (
            <Card key={log.id}>
              <CardBody className="flex items-center justify-between py-2 text-sm">
                <span className="text-[#303238]">
                  <strong>{log.actorName}</strong> {describeActivity(log.action)}
                </span>
                <span className="text-xs text-[#9a9ca3]">{formatTimestamp(log.createdAt)}</span>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 text-[#747780]">
          {icon}
          <span className="text-sm">{label}</span>
        </div>
        <p className="mt-2 text-2xl font-semibold text-[#303238]">{value ?? "—"}</p>
        {hint && <p className="mt-1 text-xs text-[#9a9ca3]">{hint}</p>}
      </CardBody>
    </Card>
  );
}
