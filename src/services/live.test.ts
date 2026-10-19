import { beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeLiveSnapshot, writeLiveSnapshot } from "./live";

const mocks = vi.hoisted(() => ({
  db: {},
  doc: vi.fn((_db: unknown, ...path: string[]) => path.join("/")),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
  stored: null as null | { lessonId: string; json: string; seq: number; updatedAt: unknown },
  listener: null as null | ((snapshot: any) => void),
}));

vi.mock("@/lib/firebase", () => ({ db: mocks.db }));
vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  onSnapshot: mocks.onSnapshot,
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
}));

describe("live board snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stored = null;
    mocks.listener = null;
    mocks.onSnapshot.mockImplementation((_ref, _options, callback) => {
      mocks.listener = callback;
      return vi.fn();
    });
    mocks.runTransaction.mockImplementation(async (_db, operation) => operation({
      get: async () => ({
        exists: () => mocks.stored !== null,
        data: () => mocks.stored ?? {},
      }),
      set: (_ref: unknown, data: typeof mocks.stored) => { mocks.stored = data; },
    }));
  });

  it("accepts consecutive strokes and rejects an older in-flight snapshot", async () => {
    await writeLiveSnapshot("room-1", "lesson-1", "page-1", "stroke one", 100);
    await writeLiveSnapshot("room-1", "lesson-1", "page-1", "stroke two", 101);
    await writeLiveSnapshot("room-1", "lesson-1", "page-1", "stale stroke", 100);
    expect(mocks.stored).toMatchObject({ lessonId: "lesson-1", json: "stroke two", seq: 101 });
  });

  it("delivers successive student snapshots through one listener without a refresh", () => {
    const received: Array<{ json: string | null; confirmed: boolean; seq: number }> = [];
    const unsubscribe = subscribeLiveSnapshot("room-1", "page-1", (json, confirmed, seq) => {
      received.push({ json, confirmed, seq });
    });
    const callback = mocks.listener;
    expect(callback).toBeTruthy();
    callback!({ exists: () => true, data: () => ({ json: "stroke 1", seq: 1 }), metadata: { fromCache: false } });
    callback!({ exists: () => true, data: () => ({ json: "stroke 2", seq: 2 }), metadata: { fromCache: false } });
    expect(received).toEqual([
      { json: "stroke 1", confirmed: true, seq: 1 },
      { json: "stroke 2", confirmed: true, seq: 2 },
    ]);
    expect(unsubscribe).toBeTypeOf("function");
  });

  it("delivers an erase snapshot and a later undo snapshot to the student in order", async () => {
    const received: string[] = [];
    subscribeLiveSnapshot("room-1", "page-1", (json) => {
      if (json) received.push(json);
    });
    const before = JSON.stringify({ objects: [{ type: "IText", text: "Teacher's note" }] });
    const partialErase = JSON.stringify({ objects: [
      { type: "IText", text: "Teacher's note" },
      { type: "Path", globalCompositeOperation: "destination-out", strokeWidth: 20, path: [["M", 20, 30], ["L", 40, 30]] },
    ] });
    await writeLiveSnapshot("room-1", "lesson-1", "page-1", before, 200);
    mocks.listener!({ exists: () => true, data: () => ({ json: partialErase, seq: 201 }), metadata: { fromCache: false } });
    await writeLiveSnapshot("room-1", "lesson-1", "page-1", before, 202);
    mocks.listener!({ exists: () => true, data: () => ({ json: before, seq: 202 }), metadata: { fromCache: false } });
    expect(received).toEqual([partialErase, before]);
    expect(JSON.parse(received[0]).objects).toHaveLength(2);
    expect(JSON.parse(received[0]).objects[1].globalCompositeOperation).toBe("destination-out");
  });
});
