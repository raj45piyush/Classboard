import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { BoardMode, Lesson } from "@/types";

export interface LessonWithClassroom extends Lesson {
  classroomId: string;
  classroomTitle: string;
}

function toLesson(id: string, data: any, classroomId = ""): Lesson {
  return {
    id,
    classroomId: data.classroomId ?? classroomId,
    title: data.title ?? "Untitled lesson",
    description: data.description ?? "",
    boardMode: data.boardMode ?? "blank",
    pageCount: data.pageCount ?? 0,
    published: !!data.published,
    teacherUid: data.teacherUid ?? "",
    classroomTitle: data.classroomTitle ?? "",
    createdAt: data.createdAt?.toMillis?.() ?? null,
    updatedAt: data.updatedAt?.toMillis?.() ?? null,
  };
}

/**
 * Loads lessons only beneath classrooms returned by the teacher-scoped
 * classroom query. A collection-group query cannot rely on Firestore rules to
 * filter out documents from classrooms the caller does not own.
 */
export function subscribeAllLessonsForTeacher(
  teacherUid: string,
  cb: (lessons: LessonWithClassroom[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const classroomQuery = query(collection(db, "classrooms"), where("teacherUid", "==", teacherUid));
  const lessonSubscriptions = new Map<string, Unsubscribe>();
  const classroomLessons = new Map<string, { title: string; lessons: Lesson[] | null }>();
  let failed = false;

  const reportError = (error: Error) => {
    if (failed) return;
    failed = true;
    onError(error);
  };

  const emit = () => {
    if (failed || [...classroomLessons.values()].some((entry) => entry.lessons === null)) return;
    const list = [...classroomLessons.entries()].flatMap(([classroomId, entry]) =>
      (entry.lessons ?? []).map((lesson) => ({
        ...lesson,
        classroomId,
        classroomTitle: entry.title,
      }))
    );
    list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    cb(list);
  };

  const classroomsSubscription = onSnapshot(classroomQuery, (snapshot) => {
    const currentIds = new Set(snapshot.docs.map((classroom) => classroom.id));

    for (const [classroomId, unsubscribe] of lessonSubscriptions) {
      if (!currentIds.has(classroomId)) {
        unsubscribe();
        lessonSubscriptions.delete(classroomId);
        classroomLessons.delete(classroomId);
      }
    }

    for (const classroom of snapshot.docs) {
      const existing = classroomLessons.get(classroom.id);
      const title = classroom.data().title ?? "Classroom";
      if (existing) {
        existing.title = title;
        continue;
      }

      classroomLessons.set(classroom.id, { title, lessons: null });
      const unsubscribe = subscribeLessons(
        classroom.id,
        (lessons) => {
          const entry = classroomLessons.get(classroom.id);
          if (!entry) return;
          entry.lessons = lessons;
          emit();
        },
        reportError
      );
      lessonSubscriptions.set(classroom.id, unsubscribe);
    }

    if (snapshot.empty) cb([]);
    else emit();
  }, reportError);

  return () => {
    classroomsSubscription();
    lessonSubscriptions.forEach((unsubscribe) => unsubscribe());
    lessonSubscriptions.clear();
    classroomLessons.clear();
  };
}

function lessonsCol(classroomId: string) {
  return collection(db, "classrooms", classroomId, "lessons");
}

export function subscribeLessons(
  classroomId: string,
  cb: (lessons: Lesson[], serverConfirmed?: boolean) => void,
  onError: (err: Error) => void,
  publishedOnly = false
) {
  const source = publishedOnly
    ? query(lessonsCol(classroomId), where("published", "==", true))
    : lessonsCol(classroomId);
  return onSnapshot(
    source,
    { includeMetadataChanges: true },
    (snap) => {
      const list = snap.docs.map((d) => toLesson(d.id, d.data(), classroomId));
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(list, !snap.metadata?.fromCache);
    },
    onError
  );
}

export function subscribeLesson(
  classroomId: string,
  lessonId: string,
  cb: (lesson: Lesson | null) => void,
  onError: (err: Error) => void
) {
  return onSnapshot(
    doc(db, "classrooms", classroomId, "lessons", lessonId),
    (snap) => cb(snap.exists() ? toLesson(snap.id, snap.data(), classroomId) : null),
    onError
  );
}

export async function createLesson(
  classroomId: string,
  params: { title: string; description?: string; boardMode: BoardMode; teacherUid: string; classroomTitle: string }
): Promise<string> {
  const ref = await addDoc(lessonsCol(classroomId), {
    classroomId,
    title: params.title,
    description: params.description?.trim() ?? "",
    boardMode: params.boardMode,
    pageCount: 0,
    published: false,
    teacherUid: params.teacherUid,
    classroomTitle: params.classroomTitle,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function renameLesson(classroomId: string, lessonId: string, title: string) {
  await updateDoc(doc(db, "classrooms", classroomId, "lessons", lessonId), {
    title,
    updatedAt: serverTimestamp(),
  });
}

export async function setLessonPublished(classroomId: string, lessonId: string, published: boolean) {
  await updateDoc(doc(db, "classrooms", classroomId, "lessons", lessonId), {
    published,
    updatedAt: serverTimestamp(),
  });
}

export async function setLessonPageCount(classroomId: string, lessonId: string, pageCount: number) {
  await updateDoc(doc(db, "classrooms", classroomId, "lessons", lessonId), {
    pageCount,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLesson(classroomId: string, lessonId: string) {
  await deleteDoc(doc(db, "classrooms", classroomId, "lessons", lessonId));
}
