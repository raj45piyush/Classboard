import { beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeAllLessonsForTeacher } from "./lessons";

const mocks = vi.hoisted(() => ({
  db: {},
  collectionGroup: vi.fn(),
  collection: vi.fn((_db: unknown, ...parts: string[]) => parts.join("/")),
  query: vi.fn((source: unknown, ...constraints: unknown[]) => ({ source, constraints })),
  where: vi.fn((...args: unknown[]) => args),
  onSnapshot: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: mocks.db }));
vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: mocks.collection,
  collectionGroup: mocks.collectionGroup,
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: mocks.onSnapshot,
  query: mocks.query,
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
  where: mocks.where,
}));

describe("subscribeAllLessonsForTeacher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onSnapshot.mockImplementation((target: any, optionsOrNext: any, maybeNext?: (value: any) => void) => {
      const next = typeof optionsOrNext === "function" ? optionsOrNext : maybeNext!;
      const path = target?.source ?? target;
      if (path === "classrooms") {
        queueMicrotask(() => next({
          empty: false,
          docs: [{ id: "owned-class", data: () => ({ title: "Physics" }) }],
        }));
      } else if (path === "classrooms/owned-class/lessons") {
        queueMicrotask(() => next({
          metadata: { fromCache: false },
          docs: [{
            id: "lesson-1",
            data: () => ({ title: "Motion", published: true, updatedAt: { toMillis: () => 42 } }),
          }],
        }));
      }
      return vi.fn();
    });
  });

  it("queries teacher-owned classrooms, then lessons only beneath those paths", async () => {
    const onLessons = vi.fn();
    const onError = vi.fn();
    const unsubscribe = subscribeAllLessonsForTeacher("teacher-1", onLessons, onError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.where).toHaveBeenCalledWith("teacherUid", "==", "teacher-1");
    expect(mocks.collectionGroup).not.toHaveBeenCalled();
    expect(onLessons).toHaveBeenCalledWith([expect.objectContaining({
      id: "lesson-1",
      classroomId: "owned-class",
      classroomTitle: "Physics",
    })]);
    expect(onError).not.toHaveBeenCalled();
    unsubscribe();
  });
});
