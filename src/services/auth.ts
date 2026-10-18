import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const AUTH_TIMEOUT_MS = 60_000;
const GOOGLE_TIMEOUT_MS = 60_000;
const PROFILE_TIMEOUT_MS = 45_000;

/** Bound UI-facing Firebase operations so a stalled network/popup cannot spin forever. */
function withDeadline<T>(operation: Promise<T>, timeoutMs: number, code: string, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error(message), { code }));
    }, timeoutMs);
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function signInEmail(email: string, password: string) {
  return withDeadline((async () => {
    await setPersistence(auth, browserLocalPersistence);
    return signInWithEmailAndPassword(auth, email, password);
  })(), AUTH_TIMEOUT_MS, "auth/timeout", "Email sign-in timed out. Check your connection and try again.");
}

export async function registerEmailTeacher(email: string, password: string) {
  return withDeadline((async () => {
    await setPersistence(auth, browserLocalPersistence);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return credential.user;
  })(), AUTH_TIMEOUT_MS, "auth/timeout", "Account creation timed out. Check your connection before trying again.");
}

export async function signInGoogleTeacher() {
  return withDeadline((async () => {
    await setPersistence(auth, browserLocalPersistence);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return signInWithPopup(auth, provider);
  })(), GOOGLE_TIMEOUT_MS, "auth/timeout", "Google sign-in did not finish. Close any open Google popup, check Firebase authorized domains, and try again.");
}

export async function ensureTeacherProfile(user: User, displayName?: string, phoneNumber?: string) {
  return withDeadline((async () => {
    const uid = user.uid;
    const email = user.email?.trim();
    const name = displayName?.trim() || user.displayName?.trim() || "";
    const phone = (phoneNumber || user.phoneNumber || "").replace(/[\s()-]/g, "");
    const authProvider = user.providerData.find((provider) => provider.providerId !== "firebase")?.providerId || "password";

    if (!uid || !email) {
      throw Object.assign(new Error("Firebase did not provide this account's UID and email."), { code: "profile/invalid-account" });
    }
    if (authProvider !== "password" && authProvider !== "google.com") {
      throw Object.assign(new Error("Use an email/password or Google account to access the teacher area."), { code: "profile/unsupported-provider" });
    }

    const profileRef = doc(db, "users", uid);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(profileRef);
      if (snapshot.exists()) {
        const existing = snapshot.data();
        if (existing.uid !== uid || (existing.email ?? existing.invitedEmail) !== email) {
          throw Object.assign(new Error("The existing profile does not match this Firebase account."), { code: "profile/identity-mismatch" });
        }
        if (existing.role !== "teacher") {
          throw Object.assign(new Error("This account is not registered as a teacher. Contact an administrator if this seems wrong."), { code: "profile/role-mismatch" });
        }
        if (existing.status !== "active") {
          throw Object.assign(new Error("This teacher account is not active. Contact an administrator."), { code: "profile/account-inactive" });
        }

        const existingPhone = phone || existing.phoneNumber || "";
        if (!/^\+[1-9]\d{7,14}$/.test(existingPhone)) {
          throw Object.assign(new Error("Enter a valid phone number to finish teacher profile setup."), { code: "profile/phone-required" });
        }

        const updates: Record<string, unknown> = {};
        if (displayName?.trim() && displayName.trim() !== existing.displayName) updates.displayName = displayName.trim();
        if (phone && phone !== existing.phoneNumber) {
          updates.phoneNumber = phone;
          updates.phoneNumberVerified = false;
        }
        if (Object.keys(updates).length) {
          transaction.update(profileRef, { ...updates, updatedAt: serverTimestamp() });
        }
        return;
      }

      if (name.length < 2 || name.length > 80) {
        throw Object.assign(new Error("Enter your full name to finish teacher profile setup."), { code: "profile/name-required" });
      }
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        throw Object.assign(new Error("Enter a valid phone number to finish teacher profile setup."), { code: "profile/phone-required" });
      }

      const timestamp = serverTimestamp();
      transaction.set(profileRef, {
        uid,
        displayName: name,
        email,
        phoneNumber: phone,
        phoneNumberVerified: false,
        authProvider,
        role: "teacher",
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });

    const profile = await getDoc(profileRef);
    const data = profile.data();
    if (!profile.exists() || data?.uid !== uid || (data?.email ?? data?.invitedEmail) !== email || data?.role !== "teacher" || data?.status !== "active") {
      throw Object.assign(new Error("Firestore did not confirm an active teacher profile for this account."), { code: "profile/not-ready" });
    }
  })(), PROFILE_TIMEOUT_MS, "profile/deadline-exceeded", "Teacher profile setup timed out. Your sign-in remains active; retry profile setup once the connection is stable.");
}

export async function requestPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/auth/teacher?mode=signin` });
}
