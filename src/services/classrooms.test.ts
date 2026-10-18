import { beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeClassroomJoinCode } from "./classrooms";

const mocks = vi.hoisted(() => ({
  db: {},
  onSnapshot: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: mocks.db }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...parts: string[]) => parts.join("/")),
  doc: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join("/") })),
  getDoc: vi.fn(),
  onSnapshot: mocks.onSnapshot,
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

describe("owner-only classroom join-code recovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only a valid code whose hash matches the classroom's active hash", () => {
    const callback = vi.fn();
    const activeHash = "a".repeat(64);
    subscribeClassroomJoinCode("class-1", callback, vi.fn(), activeHash);
    const snapshot = mocks.onSnapshot.mock.calls[0][1] as (value: any) => void;

    snapshot({ exists: () => true, data: () => ({ code: "ABCDEFGHJKLMNPQR", codeHash: activeHash }) });
    snapshot({ exists: () => true, data: () => ({ code: "ABCDEFGHJKLMNPQR", codeHash: "b".repeat(64) }) });
    snapshot({ exists: () => true, data: () => ({ code: "INVALID-CODE", codeHash: activeHash }) });
    snapshot({ exists: () => false, data: () => ({}) });

    expect(callback.mock.calls.map(([value]) => value)).toEqual(["ABCDEFGHJKLMNPQR", null, null, null]);
  });

  it("does not expose a private code if the classroom has no active code hash", () => {
    const callback = vi.fn();
    subscribeClassroomJoinCode("class-1", callback, vi.fn());
    const snapshot = mocks.onSnapshot.mock.calls[0][1] as (value: any) => void;
    snapshot({ exists: () => true, data: () => ({ code: "ABCDEFGHJKLMNPQR", codeHash: "a".repeat(64) }) });
    expect(callback).toHaveBeenCalledWith(null);
  });
});
