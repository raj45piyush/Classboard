// Shared type definitions for ClassBoard.
// These mirror the Firestore / Realtime Database schema documented in README.md

export type UserRole = "admin" | "teacher" | "student";

export type AccountStatus = "active" | "disabled" | "pending";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string | null;
  phoneNumber?: string | null;
  role: UserRole;
  status: AccountStatus;
  createdAt: number | null;
  updatedAt: number | null;
}

export type ClassroomStatus = "active" | "closed" | "archived";

export interface Classroom {
  id: string;
  title: string;
  subject: string;
  description: string;
  teacherUid: string;
  teacherName: string;
  joinCodeHash: string;
  joinCodeLookup: string; // short, non-secret lookup fragment used only to locate candidates
  status: ClassroomStatus;
  createdAt: number | null;
  updatedAt: number | null;
}

export type BoardMode = "blank" | "slides";

export interface Lesson {
  id: string;
  classroomId?: string;
  title: string;
  description?: string;
  boardMode: BoardMode;
  pageCount: number;
  published: boolean;
  teacherUid?: string;
  classroomTitle?: string;
  createdAt: number | null;
  updatedAt: number | null;
}

export type PageType = "board" | "slide";

export interface LessonPage {
  id: string;
  classroomId: string;
  lessonId: string;
  title: string;
  order: number;
  pageNumber: number;
  pageType: PageType;
  boardSnapshot: string | null; // serialized fabric.js JSON
  slideStoragePath: string | null;
  sourceFileName?: string | null;
  sourceMimeType?: string | null;
  version: number;
  createdAt: number | null;
  updatedAt: number | null;
  createdBy: string | null;
  schemaVersion: number;
  savedAt: number | null;
}

export type MemberAccessStatus = "active" | "left" | "removed";

export interface ClassroomMember {
  id: string;
  sessionUid: string;
  displayName: string;
  joinedAt: number | null;
  accessStatus: MemberAccessStatus;
  lastSeenAt: number | null;
  expiresAt: number | null;
}

export interface ActivityLog {
  id: string;
  actorUid: string;
  actorName: string;
  action: string;
  targetType: "classroom" | "lesson" | "user" | "system";
  targetId: string;
  createdAt: number | null;
}

// Realtime Database live session shape: /live/{classroomId}
export interface LiveSessionState {
  activeLessonId: string | null;
  activePageId: string | null;
  sharing: boolean;
  updatedAt: number;
  updatedBy: string;
}

export interface LiveBoardOp {
  id: string;
  type: "object-added" | "object-modified" | "object-removed" | "clear";
  payload: string | null; // serialized fabric object(s)
  seq: number;
  updatedAt: number;
}
