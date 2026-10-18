import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPage, deletePage, duplicatePage, getNextPageNumber, reorderPages, savePageSnapshot } from "./pages";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "teacher-1" } as any },
  db: {},
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(),
  runTransaction: vi.fn(),
  nextId: 0,
}));

vi.mock("@/lib/firebase", () => ({ auth: mocks.auth, db: mocks.db }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...parts: string[]) => parts.join("/")),
  deleteDoc: mocks.deleteDoc,
  doc: vi.fn((parent: unknown, ...parts: string[]) => {
    if (!parts.length) {
      const id = `slide-${++mocks.nextId}`;
      return { id, path: `${String(parent)}/${id}` };
    }
    return { id: parts.at(-1), path: parts.join("/") };
  }),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  writeBatch: vi.fn(() => ({ update: mocks.batchUpdate, commit: mocks.batchCommit })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nextId = 0;
  mocks.auth.currentUser = { uid: "teacher-1" };
});

describe("persistent whiteboard slides", () => {
  it("selects the next page number without relying on array length", () => {
    expect(getNextPageNumber([])).toBe(1);
    expect(getNextPageNumber([{ pageNumber: 1 }, { pageNumber: 4 }])).toBe(5);
  });

  it("writes a stable slide ID and classroom metadata once at creation", async () => {
    await expect(createPage("class-1", "lesson-1", { pageNumber: 1, pageType: "board" })).resolves.toBe("slide-1");
    const [ref, data] = mocks.setDoc.mock.calls[0];
    expect(ref).toMatchObject({ id: "slide-1", path: "classrooms/class-1/lessons/lesson-1/pages/slide-1" });
    expect(data).toMatchObject({
      id: "slide-1",
      classroomId: "class-1",
      lessonId: "lesson-1",
      title: "Slide 1",
      order: 1,
      pageNumber: 1,
      createdBy: "teacher-1",
      schemaVersion: 1,
      createdAt: "server-time",
    });
  });

  it("duplicates content under a different persistent ID", async () => {
    const source = {
      id: "slide-original", classroomId: "class-1", lessonId: "lesson-1", title: "Slide 1",
      order: 1, pageNumber: 1, pageType: "board" as const, boardSnapshot: '{"objects":[]}',
      slideStoragePath: null, version: 3, createdAt: 1, updatedAt: 2, createdBy: "teacher-1",
      schemaVersion: 1, savedAt: 2,
    };
    await expect(duplicatePage("class-1", "lesson-1", source, 2)).resolves.toBe("slide-1");
    const [, data] = mocks.setDoc.mock.calls[0];
    expect(data).toMatchObject({ id: "slide-1", title: "Slide 1 copy", order: 2, boardSnapshot: source.boardSnapshot });
    expect(data.id).not.toBe(source.id);
  });

  it("persists imported, bounded slide content atomically with the stable page", async () => {
    const snapshot = JSON.stringify({ backgroundImage: { src: "data:image/jpeg;base64,small" }, objects: [] });
    await createPage("class-1", "lesson-1", {
      pageNumber: 1,
      pageType: "slide",
      boardSnapshot: snapshot,
      sourceFileName: "lecture.pdf",
      sourceMimeType: "application/pdf",
    });
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({
      boardSnapshot: snapshot,
      sourceFileName: "lecture.pdf",
      sourceMimeType: "application/pdf",
      slideStoragePath: null,
    });
  });

  it("removes an inline slide without requiring Storage", async () => {
    const { getDocs } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [{ id: "slide-1", data: () => ({ slideStoragePath: null }) }] } as any);
    await expect(deletePage("class-1", "lesson-1", "slide-1")).resolves.toEqual({ storageCleanupFailed: false });
    expect(mocks.deleteDoc).toHaveBeenCalled();
  });

  it("reorders by position without changing slide document IDs", async () => {
    await reorderPages("class-1", "lesson-1", ["slide-b", "slide-a"]);
    expect(mocks.batchUpdate).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ path: "classrooms/class-1/lessons/lesson-1/pages/slide-b" }),
      { pageNumber: 1, order: 1, updatedAt: "server-time" }
    );
    expect(mocks.batchUpdate).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ path: "classrooms/class-1/lessons/lesson-1/pages/slide-a" }),
      { pageNumber: 2, order: 2, updatedAt: "server-time" }
    );
  });

  it("refuses oversized snapshots before sending them to Firestore", async () => {
    const oversized = "x".repeat(800_001);
    await expect(savePageSnapshot("class-1", "lesson-1", "slide-1", oversized, 0)).rejects.toThrow("BOARD_SNAPSHOT_TOO_LARGE");
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it("does not overwrite a newer saved version", async () => {
    mocks.runTransaction.mockImplementation(async (_db: unknown, body: (tx: any) => Promise<unknown>) => body({
      get: async () => ({ exists: () => true, data: () => ({ version: 4 }) }),
      update: vi.fn(),
    }));
    await expect(savePageSnapshot("class-1", "lesson-1", "slide-1", "{}", 3)).rejects.toThrow("STALE_VERSION");
  });
});
