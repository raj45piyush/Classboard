import { beforeEach, describe, expect, it, vi } from "vitest";
import { isBlankSlideSnapshot, publishSlides, getPublishedSlidesOnce } from "./publishedSlides";
import type { LessonPage } from "@/types";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "teacher-1" } as any },
  db: {},
  records: new Map<string, any>(),
  stamp: 0,
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ auth: mocks.auth, db: mocks.db }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...parts: string[]) => parts.join("/")),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...parts: string[]) => ({ id: parts.at(-1), path: parts.join("/") })),
  getDocs: vi.fn(async (source: any) => ({
    docs: [...mocks.records.entries()]
      .filter(([path, data]) => path.startsWith(`${source.collection}/`) && data.published === true)
      .map(([path, data]) => ({ id: path.split("/").at(-1), data: () => data, ref: { path } })),
  })),
  onSnapshot: vi.fn(),
  query: vi.fn((collection: unknown, ...filters: unknown[]) => ({ collection, filters })),
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
  where: vi.fn((...args: unknown[]) => args),
}));

function page(id: string, order: number, snapshot = `{"objects":[{"type":"rect","id":"${id}"}]}`): LessonPage {
  return {
    id, classroomId: "class-1", lessonId: "lesson-1", title: `Slide ${order}`, order,
    pageNumber: order, pageType: "board", boardSnapshot: snapshot, slideStoragePath: null,
    sourceFileName: null, sourceMimeType: null, version: 2, createdAt: 1, updatedAt: 2,
    createdBy: "teacher-1", schemaVersion: 1, savedAt: 2,
  };
}

const metadata = { lessonTitle: "Motion", classroomTitle: "Physics", teacherName: "Teacher" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.auth.currentUser = { uid: "teacher-1" };
  mocks.stamp = 0;
  mocks.serverTimestamp.mockImplementation(() => `server-time-${++mocks.stamp}`);
  mocks.runTransaction.mockImplementation(async (_db: unknown, body: (tx: any) => Promise<unknown>) => body({
    get: async (ref: { path: string }) => ({
      exists: () => mocks.records.has(ref.path),
      data: () => mocks.records.get(ref.path),
    }),
    set: (ref: { path: string }, value: any) => mocks.records.set(ref.path, value),
  }));
});

describe("published classroom slides", () => {
  it("publishes a saved slide without involving the live-session service", async () => {
    await expect(publishSlides("class-1", [page("slide-a", 1)], metadata)).resolves.toEqual(["slide-a"]);
    expect(mocks.records.get("classrooms/class-1/publishedSlides/slide-a")).toMatchObject({
      id: "slide-a", slideId: "slide-a", published: true, publishedBy: "teacher-1",
      boardSnapshot: page("slide-a", 1).boardSnapshot, lessonId: "lesson-1",
    });
  });

  it("publishes multiple slides with their stable IDs and page order", async () => {
    await publishSlides("class-1", [page("stable-b", 2), page("stable-a", 1)], metadata);
    expect(mocks.records.get("classrooms/class-1/publishedSlides/stable-b").order).toBe(2);
    expect(mocks.records.get("classrooms/class-1/publishedSlides/stable-a").order).toBe(1);
    expect([...mocks.records.keys()]).toHaveLength(2);
  });

  it("updates an existing published slide in place without duplicating it", async () => {
    await publishSlides("class-1", [page("stable-a", 1, "{\"objects\":[1]}")], metadata);
    const path = "classrooms/class-1/publishedSlides/stable-a";
    const originalCreatedAt = mocks.records.get(path).createdAt;
    await publishSlides("class-1", [page("stable-a", 1, "{\"objects\":[1,2]}")], metadata);
    expect(mocks.records.size).toBe(1);
    expect(mocks.records.get(path).boardSnapshot).toBe("{\"objects\":[1,2]}");
    expect(mocks.records.get(path).createdAt).toBe(originalCreatedAt);
    expect(mocks.records.get(path).publishedAt).not.toBe(mocks.records.get(path).createdAt);
    await expect(getPublishedSlidesOnce("class-1")).resolves.toMatchObject([
      { id: "stable-a", boardSnapshot: "{\"objects\":[1,2]}" },
    ]);
  });

  it("does not publish a blank slide unless the caller explicitly confirms it", async () => {
    const blank = page("blank", 1, '{"objects":[]}');
    await expect(publishSlides("class-1", [blank], metadata)).rejects.toThrow("blank");
    expect(mocks.records.size).toBe(0);
    await publishSlides("class-1", [blank], metadata, true);
    expect(mocks.records.has("classrooms/class-1/publishedSlides/blank")).toBe(true);
  });

  it("returns only published records to the student saved-slides service", async () => {
    mocks.records.set("classrooms/class-1/publishedSlides/pub", { id: "pub", classroomId: "class-1", lessonId: "lesson-1", title: "Public", order: 1, published: true, publishedBy: "teacher-1", boardSnapshot: "{}" });
    mocks.records.set("classrooms/class-1/publishedSlides/draft", { id: "draft", classroomId: "class-1", lessonId: "lesson-1", title: "Draft", order: 2, published: false });
    await expect(getPublishedSlidesOnce("class-1")).resolves.toHaveLength(1);
    expect(isBlankSlideSnapshot('{"objects":[]}')).toBe(true);
    expect(isBlankSlideSnapshot('{"objects":[{"type":"text"}]}')).toBe(false);
  });
});
