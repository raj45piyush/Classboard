import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureTeacherProfile, signInEmail, signInGoogleTeacher } from "./auth";

const mocks = vi.hoisted(() => ({
  auth: {}, db: {},
  persistence: vi.fn(), email: vi.fn(), popup: vi.fn(), getDoc: vi.fn(), doc: vi.fn(),
  runTransaction: vi.fn(), transactionGet: vi.fn(), transactionSet: vi.fn(), transactionUpdate: vi.fn(), serverTimestamp: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ auth: mocks.auth, db: mocks.db }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class { setCustomParameters = vi.fn(); },
  browserLocalPersistence: {}, setPersistence: mocks.persistence,
  signInWithEmailAndPassword: mocks.email, signInWithPopup: mocks.popup,
  createUserWithEmailAndPassword: vi.fn(), sendPasswordResetEmail: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  getDoc: mocks.getDoc,
  doc: mocks.doc,
  runTransaction: mocks.runTransaction,
  serverTimestamp: mocks.serverTimestamp,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.persistence.mockResolvedValue(undefined);
  mocks.doc.mockReturnValue({ path: "users/teacher-1" });
  mocks.serverTimestamp.mockReturnValue("server-timestamp");
  mocks.runTransaction.mockImplementation(async (_db, operation) => operation({
    get: mocks.transactionGet,
    set: mocks.transactionSet,
    update: mocks.transactionUpdate,
  }));
});

afterEach(() => vi.useRealTimers());

function teacherUser() {
  return {
    uid: "teacher-1", email: "teacher@example.com", displayName: "Taylor Teacher", phoneNumber: null,
    providerData: [{ providerId: "password" }],
  } as any;
}

describe("Firebase authentication deadlines", () => {
  it("rejects a stalled email login instead of waiting forever", async () => {
    vi.useFakeTimers();
    mocks.email.mockReturnValue(new Promise(() => {}));
    const result = expect(signInEmail("teacher@example.com", "password123")).rejects.toMatchObject({ code: "auth/timeout" });
    await vi.advanceTimersByTimeAsync(60_001);
    await result;
  });

  it("rejects a stalled Google popup with a finite authentication error", async () => {
    vi.useFakeTimers();
    mocks.popup.mockReturnValue(new Promise(() => {}));
    const result = expect(signInGoogleTeacher()).rejects.toMatchObject({ code: "auth/timeout" });
    await vi.advanceTimersByTimeAsync(60_001);
    await result;
  });
});

describe("Spark-compatible teacher profile setup", () => {
  it("creates only the authenticated user's teacher profile with a server timestamp", async () => {
    const user = teacherUser();
    mocks.transactionGet.mockResolvedValue({ exists: () => false });
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ uid: user.uid, email: user.email, role: "teacher", status: "active" }),
    });

    await ensureTeacherProfile(user, "Taylor Teacher", "+91 9876543210");

    expect(mocks.transactionSet).toHaveBeenCalledWith({ path: "users/teacher-1" }, {
      uid: user.uid,
      displayName: "Taylor Teacher",
      email: user.email,
      phoneNumber: "+919876543210",
      phoneNumberVerified: false,
      authProvider: "password",
      role: "teacher",
      status: "active",
      createdAt: "server-timestamp",
      updatedAt: "server-timestamp",
    });
    expect(user.getIdTokenResult).toBeUndefined();
  });

  it("does not rewrite an existing active teacher profile during login", async () => {
    const user = teacherUser();
    mocks.transactionGet.mockResolvedValue({
      exists: () => true,
      data: () => ({ uid: user.uid, email: user.email, role: "teacher", status: "active", displayName: user.displayName, phoneNumber: "+919876543210" }),
    });
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ uid: user.uid, email: user.email, role: "teacher", status: "active" }),
    });

    await ensureTeacherProfile(user);
    expect(mocks.transactionSet).not.toHaveBeenCalled();
    expect(mocks.transactionUpdate).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing admin or disabled profile", async () => {
    const user = teacherUser();
    for (const data of [
      { uid: user.uid, email: user.email, role: "admin", status: "active" },
      { uid: user.uid, email: user.email, role: "teacher", status: "disabled" },
    ]) {
      mocks.transactionGet.mockResolvedValueOnce({ exists: () => true, data: () => data });
      await expect(ensureTeacherProfile(user, "Taylor Teacher", "+919876543210")).rejects.toMatchObject({
        code: data.role === "admin" ? "profile/role-mismatch" : "profile/account-inactive",
      });
    }
    expect(mocks.transactionSet).not.toHaveBeenCalled();
    expect(mocks.transactionUpdate).not.toHaveBeenCalled();
  });

  it("requires a phone number for a new Google profile without claiming SMS verification", async () => {
    const user = { ...teacherUser(), providerData: [{ providerId: "google.com" }] };
    mocks.transactionGet.mockResolvedValue({ exists: () => false });
    await expect(ensureTeacherProfile(user)).rejects.toMatchObject({ code: "profile/phone-required" });
    expect(mocks.transactionSet).not.toHaveBeenCalled();
  });

  it("rejects a stalled Firestore transaction with a finite profile error", async () => {
    vi.useFakeTimers();
    mocks.runTransaction.mockReturnValue(new Promise(() => {}));
    const result = expect(ensureTeacherProfile(teacherUser(), "Taylor Teacher", "+919876543210"))
      .rejects.toMatchObject({ code: "profile/deadline-exceeded" });
    await vi.advanceTimersByTimeAsync(45_001);
    await result;
  });
});
