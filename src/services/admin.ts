import {
  collection,
  collectionGroup,
  doc,
  getCountFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import type { AccountStatus, Classroom, UserProfile } from "@/types";

export interface AdminStats {
  activeTeachers: number;
  totalClassrooms: number;
  /** Total number of classroom membership records ever created (a student joining a
   *  classroom creates one membership doc), counted across every classroom. */
  totalMemberships: number;
}

/** One-off counts (not realtime) fetched on demand — see the Refresh button in the admin UI. */
export async function fetchAdminStats(): Promise<AdminStats> {
  const [teachersSnap, classroomsSnap, membersSnap] = await Promise.all([
    getCountFromServer(query(collection(db, "users"), where("role", "==", "teacher"), where("status", "==", "active"))),
    getCountFromServer(collection(db, "classrooms")),
    getCountFromServer(collectionGroup(db, "members")),
  ]);
  return {
    activeTeachers: teachersSnap.data().count,
    totalClassrooms: classroomsSnap.data().count,
    totalMemberships: membersSnap.data().count,
  };
}

function toUser(id: string, data: any): UserProfile {
  return {
    uid: id,
    displayName: data.displayName ?? "",
    email: data.email ?? data.invitedEmail ?? null,
    phoneNumber: data.phoneNumber ?? null,
    role: data.role ?? "student",
    status: data.status ?? "active",
    createdAt: data.createdAt?.toMillis?.() ?? null,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
  };
}

export function subscribeAllTeachers(
  cb: (teachers: UserProfile[]) => void,
  onError: (err: Error) => void
) {
  // Admin-only read, enforced by Firestore rules (see firestore.rules).
  return onSnapshot(
    collection(db, "users"),
    (snap) => {
      const list = snap.docs.map((d) => toUser(d.id, d.data())).filter((u) => u.role === "teacher");
      cb(list);
    },
    onError
  );
}

export async function setTeacherStatus(uid: string, status: AccountStatus) {
  if (!uid || !["active", "disabled"].includes(status)) {
    throw new Error("Choose a valid teacher account and status.");
  }
  await updateDoc(doc(db, "users", uid), { status, updatedAt: serverTimestamp() });
}

export async function updateTeacherProfile(params: { uid: string; displayName: string; phoneNumber: string }) {
  const displayName = params.displayName.trim();
  const phoneNumber = params.phoneNumber.trim();
  if (!params.uid || displayName.length < 2 || displayName.length > 80) {
    throw new Error("Enter a teacher name between 2 and 80 characters.");
  }
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    throw new Error("Enter a valid phone number with country code.");
  }
  await updateDoc(doc(db, "users", params.uid), {
    displayName,
    phoneNumber,
    updatedAt: serverTimestamp(),
  });
}

export async function removeClassroomMember(classroomId: string, memberUid: string) {
  const callable = httpsCallable<{ classroomId: string; memberUid: string }, { removed: boolean }>(functions, "removeClassroomMember");
  await callable({ classroomId, memberUid });
}

function toClassroomAdminView(id: string, data: any): Classroom {
  return {
    id,
    title: data.title ?? "Untitled classroom",
    subject: data.subject ?? "",
    description: data.description ?? "",
    teacherUid: data.teacherUid,
    teacherName: data.teacherName ?? "",
    joinCodeHash: data.joinCodeHash ?? "",
    joinCodeLookup: "",
    status: data.status ?? "active",
    createdAt: data.createdAt?.toMillis?.() ?? null,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
  };
}

export function subscribeAllClassrooms(
  cb: (classrooms: Classroom[]) => void,
  onError: (err: Error) => void
) {
  return onSnapshot(
    collection(db, "classrooms"),
    (snap) => {
      const list = snap.docs.map((d) => toClassroomAdminView(d.id, d.data()));
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(list);
    },
    onError
  );
}


