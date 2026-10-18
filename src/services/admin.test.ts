import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminStats, setTeacherStatus, updateTeacherProfile } from "./admin";

const mocks = vi.hoisted(() => ({
  db: {},
  doc: vi.fn((_db: unknown, ...path: string[]) => path.join("/")),
  serverTimestamp: vi.fn(() => "server-time"),
  updateDoc: vi.fn(),
  collection: vi.fn((_db: unknown, path: string) => `collection:${path}`),
  collectionGroup: vi.fn((_db: unknown, name: string) => `group:${name}`),
  getCountFromServer: vi.fn(),
  query: vi.fn((target: string, ...filters: unknown[]) => `query:${target}:${filters.length}`),
  where: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/firebase", () => ({ db: mocks.db, functions: {} }));
vi.mock("firebase/firestore", () => ({
  collection: mocks.collection,
  collectionGroup: mocks.collectionGroup,
  doc: mocks.doc,
  getCountFromServer: mocks.getCountFromServer,
  onSnapshot: vi.fn(),
  query: mocks.query,
  serverTimestamp: mocks.serverTimestamp,
  updateDoc: mocks.updateDoc,
  where: mocks.where,
}));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));

describe("admin dashboard statistics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the three authorized aggregate counts", async () => {
    mocks.getCountFromServer
      .mockResolvedValueOnce({ data: () => ({ count: 4 }) })
      .mockResolvedValueOnce({ data: () => ({ count: 7 }) })
      .mockResolvedValueOnce({ data: () => ({ count: 23 }) });

    await expect(fetchAdminStats()).resolves.toEqual({
      activeTeachers: 4,
      totalClassrooms: 7,
      totalMemberships: 23,
    });
    expect(mocks.collectionGroup).toHaveBeenCalledWith(mocks.db, "members");
    expect(mocks.getCountFromServer).toHaveBeenCalledTimes(3);
  });

  it("does not return statistics when Firestore rules deny a non-admin session", async () => {
    mocks.getCountFromServer
      .mockResolvedValueOnce({ data: () => ({ count: 4 }) })
      .mockResolvedValueOnce({ data: () => ({ count: 7 }) })
      .mockRejectedValueOnce(Object.assign(new Error("Missing or insufficient permissions"), { code: "permission-denied" }));

    await expect(fetchAdminStats()).rejects.toMatchObject({ code: "permission-denied" });
    expect(mocks.getCountFromServer).toHaveBeenCalledTimes(3);
  });

  it("updates only permitted teacher profile fields and delegates authorization to Firestore rules", async () => {
    mocks.updateDoc.mockResolvedValue(undefined);
    await updateTeacherProfile({ uid: "teacher-1", displayName: "  Ada Teacher ", phoneNumber: "+919876543210" });
    expect(mocks.doc).toHaveBeenCalledWith(mocks.db, "users", "teacher-1");
    expect(mocks.updateDoc).toHaveBeenCalledWith("users/teacher-1", {
      displayName: "Ada Teacher",
      phoneNumber: "+919876543210",
      updatedAt: "server-time",
    });
  });

  it("updates active/disabled status and surfaces permission denials", async () => {
    mocks.updateDoc.mockResolvedValueOnce(undefined);
    await expect(setTeacherStatus("teacher-1", "disabled")).resolves.toBeUndefined();
    expect(mocks.updateDoc).toHaveBeenCalledWith("users/teacher-1", { status: "disabled", updatedAt: "server-time" });
    mocks.updateDoc.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    await expect(setTeacherStatus("teacher-2", "active")).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects invalid profile fields and statuses before writing", async () => {
    await expect(updateTeacherProfile({ uid: "teacher-1", displayName: "x", phoneNumber: "123" })).rejects.toThrow();
    await expect(setTeacherStatus("teacher-1", "pending")).rejects.toThrow();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});
