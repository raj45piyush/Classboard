import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ActivityLog } from "@/types";

function toLog(id: string, data: any): ActivityLog {
  return {
    id,
    actorUid: data.actorUid,
    actorName: data.actorName ?? "Someone",
    action: data.action,
    targetType: data.targetType,
    targetId: data.targetId,
    createdAt: data.createdAt?.toMillis?.() ?? null,
  };
}

export function subscribeRecentActivity(
  max: number,
  cb: (logs: ActivityLog[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, "activityLogs"), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => toLog(d.id, d.data()))), onError);
}
