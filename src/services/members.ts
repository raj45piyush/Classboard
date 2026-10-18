import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { hashJoinCode } from "@/utils/joinCode";
import type { ClassroomMember } from "@/types";

function toMember(id: string, data: any): ClassroomMember {
  return {
    id,
    sessionUid: data.sessionUid,
    displayName: data.displayName ?? "Student",
    joinedAt: data.joinedAt?.toMillis?.() ?? null,
    accessStatus: data.accessStatus ?? "active",
    lastSeenAt: data.lastSeenAt?.toMillis?.() ?? null,
    expiresAt: data.expiresAt?.toMillis?.() ?? null,
  };
}

export function subscribeMembers(
  classroomId: string,
  cb: (members: ClassroomMember[]) => void,
  onError: (err: Error) => void
) {
  return onSnapshot(
    collection(db, "classrooms", classroomId, "members"),
    (snap) => {
      const list = snap.docs.map((d) => toMember(d.id, d.data()));
      list.sort((a, b) => (b.joinedAt ?? 0) - (a.joinedAt ?? 0));
      cb(list);
    },
    onError
  );
}

export async function joinClassroomByCode(code: string, displayName: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("Sign in as a student before joining."), { code: "auth/unauthenticated" });
  const codeHash = await hashJoinCode(code);
  let codeSnapshot;
  try {
    codeSnapshot = await getDoc(doc(db, "joinCodes", codeHash));
  } catch (error) {
    if (isPermissionDenied(error)) {
      // Rules intentionally make missing, expired, and rotated code documents
      // indistinguishable so clients cannot enumerate active classrooms.
      throw Object.assign(new Error("The code is not active."), { code: "join/lookup-denied" });
    }
    throw error;
  }
  if (!codeSnapshot.exists() || codeSnapshot.data().status !== "active" || codeSnapshot.data().codeLength !== 16) {
    throw Object.assign(new Error("That code does not match an active classroom."), { code: "join/not-found" });
  }
  const classroomId = codeSnapshot.data().classroomId;
  if (typeof classroomId !== "string") {
    throw Object.assign(new Error("The classroom code is not valid. Ask your teacher to rotate it."), { code: "join/invalid-code" });
  }
  try {
    await setDoc(doc(db, "classrooms", classroomId, "members", user.uid), {
      sessionUid: user.uid,
      displayName: displayName.trim(),
      joinCodeHash: codeHash,
      accessStatus: "active",
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    });
  } catch (error) {
    if (isPermissionDenied(error)) {
      throw Object.assign(new Error("Firebase denied this classroom membership."), { code: "join/membership-denied" });
    }
    throw error;
  }
  return classroomId;
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && String((error as { code?: unknown }).code).endsWith("permission-denied");
}

export async function leaveClassroom(classroomId: string) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("Your sign-in session has expired."), { code: "auth/unauthenticated" });
  await updateDoc(doc(db, "classrooms", classroomId, "members", user.uid), {
    accessStatus: "left",
    lastSeenAt: serverTimestamp(),
  });
}
