import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStudentOfflineBundle, getStudentOfflineBundle, saveStudentOfflineBundle, type StudentOfflineBundle } from "./studentOfflineCache";

function fakeIndexedDb() {
  const records = new Map<string, unknown>();
  let opened = false;
  return {
    open: () => {
      const request: any = {};
      queueMicrotask(() => {
        const db: any = {
          createObjectStore: () => undefined,
          close: () => undefined,
          transaction: () => {
            const tx: any = {
              objectStore: () => ({
                put: (value: any) => {
                  records.set(value.key, value);
                  queueMicrotask(() => tx.oncomplete?.());
                },
                get: (key: string) => {
                  const getRequest: any = { result: records.get(key) };
                  queueMicrotask(() => getRequest.onsuccess?.());
                  return getRequest;
                },
                delete: (key: string) => {
                  records.delete(key);
                  queueMicrotask(() => tx.oncomplete?.());
                },
              }),
            };
            return tx;
          },
        };
        request.result = db;
        if (!opened) {
          opened = true;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    },
  } as unknown as IDBFactory;
}

const bundle: StudentOfflineBundle = {
  uid: "student-1",
  classroomId: "class-1",
  classroom: { id: "class-1", title: "Science", subject: "Physics", description: "", teacherUid: "teacher-1", teacherName: "Teacher", joinCodeHash: "hash", joinCodeLookup: "", status: "active", createdAt: 1, updatedAt: 2 },
  lessons: [{ id: "lesson-1", classroomId: "class-1", title: "Motion", description: "", boardMode: "blank", pageCount: 1, published: true, teacherUid: "teacher-1", classroomTitle: "Science", createdAt: 1, updatedAt: 2 }],
  pagesByLesson: {},
  liveJson: null,
  session: null,
  cachedAt: 123,
  authorized: true,
};

afterEach(() => vi.unstubAllGlobals());

describe("authorized student offline cache", () => {
  it("persists only under the matching student and classroom key", async () => {
    vi.stubGlobal("indexedDB", fakeIndexedDb());
    await saveStudentOfflineBundle(bundle);
    expect(await getStudentOfflineBundle("student-1", "class-1")).toMatchObject({ classroomId: "class-1", authorized: true });
    await expect(getStudentOfflineBundle("other-student", "class-1")).resolves.toBeNull();
  });

  it("clears cached content when membership is explicitly left or revoked", async () => {
    vi.stubGlobal("indexedDB", fakeIndexedDb());
    await saveStudentOfflineBundle(bundle);
    await clearStudentOfflineBundle("student-1", "class-1");
    await expect(getStudentOfflineBundle("student-1", "class-1")).resolves.toBeNull();
  });
});
