import { useEffect, useState } from "react";
import { subscribeRecentActivity } from "@/services/activity";
import type { ActivityLog } from "@/types";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { formatTimestamp } from "@/utils/format";
import { describeActivity } from "@/utils/activityLabels";

export default function AdminActivity() {
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeRecentActivity(100, setLogs, (err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-[#303238]">Activity history</h1>
        <p className="text-sm text-[#747780]">
          Server-recorded classroom creation, lessons, student joins, teacher registration, and teacher account changes.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {logs === null && <Spinner label="Loading activity…" />}
      {logs !== null && logs.length === 0 && <EmptyState title="No activity recorded yet" />}

      <div className="space-y-2">
        {logs?.map((log) => (
          <Card key={log.id}>
            <CardBody className="flex items-center justify-between">
              <div className="text-sm text-[#303238]">
                <strong>{log.actorName}</strong> {describeActivity(log.action)}
              </div>
              <div className="flex items-center gap-2">
                <Badge>{log.targetType}</Badge>
                <span className="text-xs text-[#9a9ca3]">{formatTimestamp(log.createdAt)}</span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
