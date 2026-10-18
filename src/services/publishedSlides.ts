import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { MAX_BOARD_SNAPSHOT_BYTES } from "@/services/pages";
import type { LessonPage } from "@/types";

export interface PublishedSlide extends LessonPage {
  published: true;
  publishedBy: string;
  publishedAt: number | null;
  lessonTitle: string;
  classroomTitle: string;
  teacherName: string;
  sourceVersion: number;
}

export interface PublishMetadata {
  lessonTitle: string;
  classroomTitle: string;
  teacherName: string;
}

function publishedCollection(classroomId: string) {
  return collection(db, "classrooms", classroomId, "publishedSlides");
}

function toPublishedSlide(id: string, data: any, classroomId: string): PublishedSlide {
  return {
    id,
    classroomId: data.classroomId ?? classroomId,
    lessonId: data.lessonId,
    title: data.title,
    order: data.order,
    pageNumber: data.pageNumber,
    pageType: data.pageType ?? "board",
    boardSnapshot: data.boardSnapshot ?? null,
    slideStoragePath: data.slideStoragePath ?? null,
    sourceFileName: data.sourceFileName ?? null,
    sourceMimeType: data.sourceMimeType ?? null,
    version: data.sourceVersion ?? 0,
    sourceVersion: data.sourceVersion ?? 0,
    createdAt: data.createdAt?.toMillis?.() ?? null,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
    createdBy: data.createdBy ?? null,
    schemaVersion: data.schemaVersion ?? 1,
    savedAt: data.updatedAt?.toMillis?.() ?? null,
    published: true,
    publishedBy: data.publishedBy,
    publishedAt: data.publishedAt?.toMillis?.() ?? null,
    lessonTitle: data.lessonTitle ?? "Published presentation",
    classroomTitle: data.classroomTitle ?? "Classroom",
    teacherName: data.teacherName ?? "Teacher",
  };
}

export function isBlankSlideSnapshot(snapshot: string | null | undefined): boolean {
  if (!snapshot?.trim()) return true;
  try {
    const data = JSON.parse(snapshot) as { objects?: unknown[]; backgroundImage?: unknown };
    return (!Array.isArray(data.objects) || data.objects.length === 0) && !data.backgroundImage;
  } catch {
    return false; // Invalid saved content should be published as-is only after validation elsewhere.
  }
}

export async function publishSlides(
  classroomId: string,
  pages: LessonPage[],
  metadata: PublishMetadata,
  allowBlank = false
): Promise<string[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again before publishing slides.");
  if (pages.length === 0) throw new Error("There are no saved slides to publish.");
  for (const page of pages) {
    if (!page.id || page.classroomId !== classroomId || !page.lessonId) throw new Error("A slide is missing its classroom or stable slide ID.");
    if (!allowBlank && isBlankSlideSnapshot(page.boardSnapshot)) throw new Error(`“${page.title}” is blank. Confirm publishing blank slides to continue.`);
    if (page.boardSnapshot && new TextEncoder().encode(page.boardSnapshot).byteLength > MAX_BOARD_SNAPSHOT_BYTES) {
      throw new Error(`“${page.title}” exceeds the Firestore slide size limit. Reduce its content before publishing.`);
    }
  }

  // Document IDs are the original stable slide IDs. A repeat publish updates
  // the existing snapshot instead of creating a second student-visible slide.
  for (const page of pages) {
    const ref = doc(db, "classrooms", classroomId, "publishedSlides", page.id);
    await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(ref);
      const prior = existing.exists() ? existing.data() : null;
      transaction.set(ref, {
        classroomId,
        lessonId: page.lessonId,
        slideId: page.id,
        id: page.id,
        title: page.title.slice(0, 100),
        order: page.order,
        pageNumber: page.pageNumber,
        pageType: page.pageType,
        boardSnapshot: page.boardSnapshot,
        slideStoragePath: page.slideStoragePath,
        sourceFileName: page.sourceFileName ?? null,
        sourceMimeType: page.sourceMimeType ?? null,
        sourceVersion: page.version,
        createdBy: page.createdBy ?? uid,
        schemaVersion: page.schemaVersion || 1,
        lessonTitle: metadata.lessonTitle.slice(0, 80),
        classroomTitle: metadata.classroomTitle.slice(0, 100),
        teacherName: metadata.teacherName.slice(0, 80),
        published: true,
        publishedBy: uid,
        createdAt: prior?.createdAt ?? serverTimestamp(),
        publishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }
  return pages.map((page) => page.id);
}

export function subscribePublishedSlides(
  classroomId: string,
  callback: (slides: PublishedSlide[], serverConfirmed: boolean) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const source = query(publishedCollection(classroomId), where("published", "==", true));
  return onSnapshot(source, { includeMetadataChanges: true }, (snapshot) => {
    const slides = snapshot.docs.map((entry) => toPublishedSlide(entry.id, entry.data(), classroomId));
    slides.sort((a, b) => a.order - b.order || (a.publishedAt ?? 0) - (b.publishedAt ?? 0) || a.id.localeCompare(b.id));
    callback(slides, !snapshot.metadata.fromCache);
  }, onError);
}

export async function getPublishedSlidesOnce(classroomId: string): Promise<PublishedSlide[]> {
  const snapshot = await getDocs(query(publishedCollection(classroomId), where("published", "==", true)));
  const slides = snapshot.docs.map((entry) => toPublishedSlide(entry.id, entry.data(), classroomId));
  return slides.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export async function unpublishLessonSlides(classroomId: string, lessonId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again before unpublishing slides.");
  const matches = (await getDocs(query(publishedCollection(classroomId), where("lessonId", "==", lessonId)))).docs;
  for (const entry of matches) await deleteDoc(entry.ref);
}

