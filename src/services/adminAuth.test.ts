import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAdminAccount } from "./adminAuth";

const mocks = vi.hoisted(() => ({
  db: {},
  doc: vi.fn((_db: unknown, ...path: string[]) => path.join("/")),
  getDoc: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: mocks.db }));
vi.mock("firebase/firestore", () => ({ doc: mocks.doc, getDoc: mocks.getDoc }));

function user(claimRole: string | undefined = "admin") {
  return {
    uid: "admin-1",
    email: "admin@example.com",
    emailVerified: true,
    getIdTokenResult: vi.fn().mockResolvedValue({ claims: claimRole ? { role: claimRole } : {} }),
  } as any;
}

describe("verifyAdminAccount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("force-refreshes the token and verifies the matching active Firestore admin profile", async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ uid: "admin-1", email: "admin@example.com", role: "admin", status: "active" }),
    });
    const signedInUser = user();
    await expect(verifyAdminAccount(signedInUser)).resolves.toBeUndefined();
    expect(signedInUser.getIdTokenResult).toHaveBeenCalledWith(true);
    expect(mocks.doc).toHaveBeenCalledWith(mocks.db, "users", "admin-1");
  });

  it("rejects a missing or stale admin claim without trusting the profile", async () => {
    await expect(verifyAdminAccount(user("teacher"))).rejects.toMatchObject({ code: "auth/admin-role-required" });
    expect(mocks.getDoc).not.toHaveBeenCalled();
  });

  it("rejects a missing, mismatched, or disabled profile", async () => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined });
    await expect(verifyAdminAccount(user())).rejects.toMatchObject({ code: "profile/admin-profile-missing" });
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: "admin-1", email: "admin@example.com", role: "admin", status: "disabled" }),
    });
    await expect(verifyAdminAccount(user())).rejects.toMatchObject({ code: "profile/admin-account-disabled" });
  });

  it("reports Firestore permission errors distinctly", async () => {
    mocks.getDoc.mockRejectedValue(Object.assign(new Error("denied"), { code: "permission-denied" }));
    await expect(verifyAdminAccount(user())).rejects.toMatchObject({ code: "firestore/permission-denied" });
  });
});
