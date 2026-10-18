import { beforeEach, describe, expect, it, vi } from "vitest";
import { joinClassroomByCode, leaveClassroom } from "./members";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "student-1" } as any },
  db: {},
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
}));

vi.mock("@/lib/firebase", () => ({ auth: mocks.auth, db: mocks.db }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((...parts: unknown[]) => parts.join("/")),
  doc: vi.fn((_db: unknown, ...parts: unknown[]) => parts.join("/")),
  getDoc: mocks.getDoc,
  onSnapshot: vi.fn(),
  serverTimestamp: mocks.serverTimestamp,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = { uid: "student-1" };
  mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ classroomId: "class-1", status: "active", codeLength: 16 }) });
});

describe("Spark-compatible classroom membership", () => {
  it("resolves a shared code and creates only the signed-in user's membership", async () => {
    await expect(joinClassroomByCode("ABCDEFGHJKLMNPQR", "Student One")).resolves.toBe("class-1");
    expect(mocks.setDoc).toHaveBeenCalledWith("classrooms/class-1/members/student-1", expect.objectContaining({
      sessionUid: "student-1",
      displayName: "Student One",
      accessStatus: "active",
      joinCodeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      joinedAt: "server-time",
      lastSeenAt: "server-time",
    }));
  });

  it("does not create a membership when the code is missing", async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false, data: () => undefined });
    await expect(joinClassroomByCode("ABCDEFGHJKLMNPQR", "Student One")).rejects.toMatchObject({ code: "join/not-found" });
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("treats a stale or rotated code as unavailable without writing membership", async () => {
    mocks.getDoc.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    await expect(joinClassroomByCode("ABCDEFGHJKLMNPQR", "Student One")).rejects.toMatchObject({ code: "join/lookup-denied" });
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("reports membership permission failures separately from invalid codes", async () => {
    mocks.setDoc.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    await expect(joinClassroomByCode("ABCDEFGHJKLMNPQR", "Student One")).rejects.toMatchObject({ code: "join/membership-denied" });
  });

  it("marks only the signed-in user's own membership as left", async () => {
    await leaveClassroom("class-1");
    expect(mocks.updateDoc).toHaveBeenCalledWith("classrooms/class-1/members/student-1", {
      accessStatus: "left",
      lastSeenAt: "server-time",
    });
  });
});
