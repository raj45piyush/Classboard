import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { deleteSlideFile } from "@/services/storage";
import type { LessonPage, PageType } from "@/types";

export const MAX_BOARD_SNAPSHOT_BYTES = 800_000;

export function getNextPageNumber(pages: Pick<LessonPage, "pageNumber">[]): number {
  return pages.reduce((next, page) => Math.max(next, page.pageNumber + 1), 1);
}

function timestampMillis(value: any): number | null {
  return value?.toMillis?.() ?? null;
}

function toPage(id: string, data: any, classroomId: string, lessonId: string): LessonPage {
  return {
    id,
    classroomId: data.classroomId ?? classroomId,
    lessonId: data.lessonId ?? lessonId,
    title: data.title ?? `Slide ${data.order ?? data.pageNumber ?? 1}`,
    order: data.order ?? data.pageNumber ?? 0,
    pageNumber: data.pageNumber ?? 0,
    pageType: data.pageType ?? "board",
    boardSnapshot: data.boardSnapshot ?? null,
    slideStoragePath: data.slideStoragePath ?? null,
    sourceFileName: data.sourceFileName ?? null,
    sourceMimeType: data.sourceMimeType ?? null,
    version: data.version ?? 0,
    createdAt: timestampMillis(data.createdAt) ?? timestampMillis(data.savedAt),
    updatedAt: timestampMillis(data.updatedAt) ?? timestampMillis(data.savedAt),
    createdBy: data.createdBy ?? null,
    schemaVersion: data.schemaVersion ?? 0,
    savedAt: timestampMillis(data.savedAt),
  };
}

function pagesCol(classroomId: string, lessonId: string) {
  return collection(db, "classrooms", classroomId, "lessons", lessonId, "pages");
}

export function subscribePages(
  classroomId: string,
  lessonId: string,
  cb: (pages: LessonPage[], serverConfirmed?: boolean) => void,
  onError: (err: Error) => void
) {
  const q = query(pagesCol(classroomId, lessonId), orderBy("pageNumber", "asc"));
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => cb(
    snap.docs.map((d) => toPage(d.id, d.data(), classroomId, lessonId)),
    !snap.metadata.fromCache
  ), onError);
}

export async function createPage(
  classroomId: string,
  lessonId: string,
  params: { pageNumber: number; pageType: PageType; slideStoragePath?: string | null; title?: string; id?: string; boardSnapshot?: string | null; sourceFileName?: string | null; sourceMimeType?: string | null }
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again before adding a slide.");
  if (params.boardSnapshot && new TextEncoder().encode(params.boardSnapshot).byteLength > MAX_BOARD_SNAPSHOT_BYTES) {
    throw new Error("BOARD_SNAPSHOT_TOO_LARGE");
  }
  const ref = params.id
    ? doc(db, "classrooms", classroomId, "lessons", lessonId, "pages", params.id)
    : doc(pagesCol(classroomId, lessonId));
  await setDoc(ref, {
    id: ref.id,
    classroomId,
    lessonId,
    title: params.title?.trim() || `Slide ${params.pageNumber}`,
    order: params.pageNumber,
    pageNumber: params.pageNumber,
    pageType: params.pageType,
    boardSnapshot: params.boardSnapshot ?? null,
    slideStoragePath: params.slideStoragePath ?? null,
    sourceFileName: params.sourceFileName ?? null,
    sourceMimeType: params.sourceMimeType ?? null,
    version: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    schemaVersion: 1,
    savedAt: serverTimestamp(),
  });
  return ref.id;
}

export function allocatePageId(classroomId: string, lessonId: string): string {
  return doc(pagesCol(classroomId, lessonId)).id;
}

export async function duplicatePage(
  classroomId: string,
  lessonId: string,
  source: LessonPage,
  newPageNumber: number
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again before duplicating a slide.");
  if (source.boardSnapshot && new TextEncoder().encode(source.boardSnapshot).byteLength > MAX_BOARD_SNAPSHOT_BYTES) {
    throw new Error("BOARD_SNAPSHOT_TOO_LARGE");
  }
  const ref = doc(pagesCol(classroomId, lessonId));
  await setDoc(ref, {
    id: ref.id,
    classroomId,
    lessonId,
    title: `${source.title || `Slide ${source.order}`} copy`,
    order: newPageNumber,
    pageNumber: newPageNumber,
    pageType: source.pageType,
    boardSnapshot: source.boardSnapshot,
    slideStoragePath: source.slideStoragePath,
    sourceFileName: source.sourceFileName ?? null,
    sourceMimeType: source.sourceMimeType ?? null,
    version: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    schemaVersion: 1,
    savedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deletePage(classroomId: string, lessonId: string, pageId: string) {
  const pageRef = doc(db, "classrooms", classroomId, "lessons", lessonId, "pages", pageId);
  const all = await getDocs(pagesCol(classroomId, lessonId));
  const target = all.docs.find((entry) => entry.id === pageId);
  const storagePath = target?.data().slideStoragePath;
  const hasOtherReference = typeof storagePath === "string" && all.docs.some((entry) =>
    entry.id !== pageId && entry.data().slideStoragePath === storagePath
  );
  await deleteDoc(pageRef);
  if (!storagePath || hasOtherReference) return { storageCleanupFailed: false };
  try {
    await deleteSlideFile(storagePath);
    return { storageCleanupFailed: false };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error
      && String((error as { code: unknown }).code) === "storage/object-not-found") {
      return { storageCleanupFailed: false };
    }
    return { storageCleanupFailed: true };
  }
}

export async function reorderPages(
  classroomId: string,
  lessonId: string,
  orderedPageIds: string[]
) {
  const batch = writeBatch(db);
  orderedPageIds.forEach((pageId, index) => {
    batch.update(doc(db, "classrooms", classroomId, "lessons", lessonId, "pages", pageId), {
      pageNumber: index + 1,
      order: index + 1,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function saveSlideTitle(classroomId: string, lessonId: string, pageId: string, title: string) {
  const normalized = title.trim();
  if (!normalized || normalized.length > 100) throw new Error("Enter a slide title under 100 characters.");
  await updateDoc(doc(db, "classrooms", classroomId, "lessons", lessonId, "pages", pageId), {
    title: normalized,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Saves a board snapshot using an optimistic-concurrency transaction so a
 * slow/late write can never silently clobber a newer save.
 */
export async function savePageSnapshot(
  classroomId: string,
  lessonId: string,
  pageId: string,
  snapshotJson: string,
  expectedVersion: number
): Promise<number> {
  const snapshotSize = new TextEncoder().encode(snapshotJson).byteLength;
  if (snapshotSize > MAX_BOARD_SNAPSHOT_BYTES) {
    throw new Error("BOARD_SNAPSHOT_TOO_LARGE");
  }
  const ref = doc(db, "classrooms", classroomId, "lessons", lessonId, "pages", pageId);
  const newVersion = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Page no longer exists");
    const currentVersion = snap.data().version ?? 0;
    if (currentVersion > expectedVersion) {
      throw new Error("STALE_VERSION");
    }
    const next = currentVersion + 1;
    tx.update(ref, {
      boardSnapshot: snapshotJson,
      version: next,
      savedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return next;
  });
  return newVersion;
}

export async function getAllPagesOnce(classroomId: string, lessonId: string): Promise<LessonPage[]> {
  const q = query(pagesCol(classroomId, lessonId), orderBy("pageNumber", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toPage(d.id, d.data(), classroomId, lessonId));
}
