// Spark-compatible live teaching uses Firestore listeners. Unlike Realtime
// Database rules, Firestore rules can verify the classroom's owner and member
// documents directly, without custom claims or a trusted roster function.
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { LiveSessionState } from "@/types";

type LiveSessionListener = (session: LiveSessionState | null, serverConfirmed: boolean) => void;

function sessionRef(classroomId: string) {
  return doc(db, "classrooms", classroomId, "live", "session");
}

function snapshotRef(classroomId: string, pageId: string) {
  return doc(db, "classrooms", classroomId, "livePages", pageId);
}

function toSession(data: Record<string, any> | undefined): LiveSessionState | null {
  if (!data) return null;
  return {
    activeLessonId: data.activeLessonId ?? null,
    activePageId: data.activePageId ?? null,
    sharing: data.sharing === true,
    updatedBy: data.updatedBy ?? "",
    updatedAt: data.updatedAt?.toMillis?.() ?? 0,
  };
}

export function subscribeSession(
  classroomId: string,
  cb: LiveSessionListener,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(sessionRef(classroomId), { includeMetadataChanges: true }, (snapshot) => {
    cb(snapshot.exists() ? toSession(snapshot.data()) : null, !snapshot.metadata.fromCache);
  }, onError);
}

export async function setSession(
  classroomId: string,
  patch: Partial<Omit<LiveSessionState, "updatedAt" | "updatedBy">>,
  updatedBy: string
) {
  await setDoc(sessionRef(classroomId), {
    ...patch,
    updatedBy,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** One compact board snapshot per completed Fabric operation, debounced by the caller. */
export async function writeLiveSnapshot(classroomId: string, lessonId: string, pageId: string, json: string, seq: number) {
  await setDoc(snapshotRef(classroomId, pageId), {
    lessonId,
    json,
    seq,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeLiveSnapshot(
  classroomId: string,
  pageId: string,
  cb: (json: string | null, serverConfirmed: boolean) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(snapshotRef(classroomId, pageId), { includeMetadataChanges: true }, (snapshot) => {
    cb(snapshot.exists() ? snapshot.data().json ?? null : null, !snapshot.metadata.fromCache);
  }, onError);
}

/** Browser network state is supplemental; Firestore listener metadata is the server confirmation. */
export function subscribeConnectionState(cb: (connected: boolean) => void): Unsubscribe {
  const update = () => cb(navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}
