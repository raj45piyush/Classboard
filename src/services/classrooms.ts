import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateJoinCode, hashJoinCode } from "@/utils/joinCode";
import type { Classroom, ClassroomStatus } from "@/types";

function toClassroom(id: string, data: any): Classroom {
  return {
    id,
    title: data.title ?? "Untitled classroom",
    subject: data.subject ?? "",
    description: data.description ?? "",
    teacherUid: data.teacherUid,
    teacherName: data.teacherName ?? "",
    joinCodeHash: data.joinCodeHash ?? "",
    joinCodeLookup: data.joinCodeLookup ?? "",
    status: data.status ?? "active",
    createdAt: data.createdAt?.toMillis?.() ?? null,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
  };
}

export function subscribeTeacherClassrooms(
  teacherUid: string,
  cb: (classrooms: Classroom[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, "classrooms"), where("teacherUid", "==", teacherUid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => toClassroom(d.id, d.data()));
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(list);
    },
    onError
  );
}

export function subscribeClassroom(
  classroomId: string,
  cb: (classroom: Classroom | null, serverConfirmed?: boolean) => void,
  onError: (err: Error) => void
) {
  return onSnapshot(
    doc(db, "classrooms", classroomId),
    { includeMetadataChanges: true },
    (snap) => cb(snap.exists() ? toClassroom(snap.id, snap.data()) : null, !snap.metadata.fromCache),
    onError
  );
}

/** Reads the active share code from an owner-only Firestore path. */
export function subscribeClassroomJoinCode(
  classroomId: string,
  cb: (code: string | null) => void,
  onError: (err: Error) => void,
  activeJoinCodeHash?: string
) {
  return onSnapshot(doc(db, "classrooms", classroomId, "private", "joinCode"), (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    const data = snap.data();
    const validFormat = typeof data.code === "string" && /^[A-HJ-NP-Z2-9]{16}$/.test(data.code);
    const activeHashMatches = typeof activeJoinCodeHash === "string"
      && /^[a-f0-9]{64}$/.test(activeJoinCodeHash)
      && data.codeHash === activeJoinCodeHash;
    cb(validFormat && activeHashMatches ? data.code : null);
  }, onError);
}

export async function getClassroomOnce(classroomId: string): Promise<Classroom | null> {
  const snap = await getDoc(doc(db, "classrooms", classroomId));
  return snap.exists() ? toClassroom(snap.id, snap.data()) : null;
}

/** Creates a classroom and returns its share code; a private owner-only copy permits recovery after reload. */
export async function createClassroom(params: {
  title: string;
  subject: string;
  description?: string;
  teacherUid: string;
  teacherName: string;
}): Promise<{ classroomId: string; joinCode: string }> {
  const code = generateJoinCode();
  const hash = await hashJoinCode(code);

  const classroomRef = doc(collection(db, "classrooms"));
  const batch = writeBatch(db);
  batch.set(classroomRef, {
    title: params.title,
    subject: params.subject,
    description: params.description ?? "",
    teacherUid: params.teacherUid,
    teacherName: params.teacherName,
    joinCodeHash: hash,
    status: "active" as ClassroomStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, "joinCodes", hash), {
    classroomId: classroomRef.id,
    status: "active",
    codeLength: code.length,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "classrooms", classroomRef.id, "private", "joinCode"), {
    code,
    codeHash: hash,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  return { classroomId: classroomRef.id, joinCode: code };
}

/** Rotates the join code: the old code stops working immediately. Returns the new plain-text code. */
export async function rotateJoinCode(classroomId: string, previousHash: string): Promise<string> {
  const code = generateJoinCode();
  const hash = await hashJoinCode(code);

  const batch = writeBatch(db);
  batch.set(doc(db, "joinCodes", hash), {
    classroomId,
    status: "active",
    codeLength: code.length,
    createdAt: serverTimestamp(),
  });

  if (previousHash) {
    batch.delete(doc(db, "joinCodes", previousHash));
  }
  batch.update(doc(db, "classrooms", classroomId), {
    joinCodeHash: hash,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "classrooms", classroomId, "private", "joinCode"), {
    code,
    codeHash: hash,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  return code;
}

export async function setClassroomStatus(classroomId: string, status: ClassroomStatus) {
  await updateDoc(doc(db, "classrooms", classroomId), { status, updatedAt: serverTimestamp() });
}

export async function updateClassroomDetails(
  classroomId: string,
  patch: { title?: string; subject?: string; description?: string }
) {
  await updateDoc(doc(db, "classrooms", classroomId), { ...patch, updatedAt: serverTimestamp() });
}

