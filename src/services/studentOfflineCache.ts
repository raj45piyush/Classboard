import type { Classroom, Lesson, LessonPage, LiveSessionState } from "@/types";
import type { PublishedSlide } from "@/services/publishedSlides";

export interface StudentOfflineBundle {
  uid: string;
  classroomId: string;
  classroom: Classroom;
  lessons: Lesson[];
  pagesByLesson: Record<string, LessonPage[]>;
  publishedSlides?: PublishedSlide[];
  liveJson: string | null;
  session: LiveSessionState | null;
  cachedAt: number;
  authorized: true;
}

const DATABASE = "classboard-authorized-student-content";
const STORE = "published-classrooms";

function openCache(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline lesson storage."));
  });
}

export async function saveStudentOfflineBundle(bundle: StudentOfflineBundle): Promise<void> {
  const db = await openCache();
  try {
    const value = { ...bundle, key: `${bundle.uid}:${bundle.classroomId}` };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save offline lesson content."));
      tx.onabort = () => reject(tx.error ?? new Error("Offline lesson cache was not saved."));
    });
  } finally {
    db.close();
  }
}

export async function getStudentOfflineBundle(uid: string, classroomId: string): Promise<StudentOfflineBundle | null> {
  const db = await openCache();
  try {
    return await new Promise<StudentOfflineBundle | null>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(`${uid}:${classroomId}`);
      request.onsuccess = () => {
        const value = request.result;
        if (!value || value.uid !== uid || value.classroomId !== classroomId || value.authorized !== true) {
          resolve(null);
          return;
        }
        const { key: _key, ...bundle } = value;
        resolve(bundle as StudentOfflineBundle);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read offline lesson content."));
    });
  } finally {
    db.close();
  }
}

export async function clearStudentOfflineBundle(uid: string, classroomId: string): Promise<void> {
  const db = await openCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(`${uid}:${classroomId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not clear offline lesson content."));
      tx.onabort = () => reject(tx.error ?? new Error("Offline content cleanup did not complete."));
    });
  } finally {
    db.close();
  }
}
