const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineString } = require("firebase-functions/params");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { createHash } = require("node:crypto");

initializeApp();
setGlobalOptions({ maxInstances: 5, region: "us-central1" });

const auth = getAuth();
const db = getFirestore();
const realtimeDatabaseUrl = defineString("FIREBASE_DATABASE_URL");

function liveDatabase() {
  return getDatabase(undefined, realtimeDatabaseUrl.value());
}

async function writeActivity(id, entry) {
  try {
    await db.doc(`activityLogs/${id}`).create({ ...entry, createdAt: FieldValue.serverTimestamp() });
  } catch (error) {
    if (error.code !== 6 && error.code !== "already-exists") throw error;
  }
}

exports.initializeLiveClassroom = onDocumentCreated("classrooms/{classroomId}", async (event) => {
  const classroom = event.data?.data();
  if (!classroom?.teacherUid) return;
  await liveDatabase().ref(`live/${event.params.classroomId}/teacherUid`).set(classroom.teacherUid);
  const teacher = await db.doc(`users/${classroom.teacherUid}`).get();
  await writeActivity(`classroom_${event.id}`, {
    actorUid: classroom.teacherUid,
    actorName: teacher.data()?.displayName || "Teacher",
    action: "classroom_created",
    targetType: "classroom",
    targetId: event.params.classroomId,
  });
});

exports.recordLessonCreation = onDocumentCreated("classrooms/{classroomId}/lessons/{lessonId}", async (event) => {
  const lesson = event.data?.data();
  if (!lesson?.teacherUid) return;
  const [classroom, teacher] = await Promise.all([
    db.doc(`classrooms/${event.params.classroomId}`).get(),
    db.doc(`users/${lesson.teacherUid}`).get(),
  ]);
  if (!classroom.exists || classroom.data().teacherUid !== lesson.teacherUid) return;
  await writeActivity(`lesson_${event.id}`, {
    actorUid: lesson.teacherUid,
    actorName: teacher.data()?.displayName || "Teacher",
    action: "lesson_created",
    targetType: "lesson",
    targetId: event.params.lessonId,
  });
});

exports.ensureLiveClassroom = onCall(async (request) => {
  if (!request.auth || request.auth.token.role !== "teacher") {
    throw new HttpsError("permission-denied", "An active teacher account is required.");
  }
  const user = await db.doc(`users/${request.auth.uid}`).get();
  if (!user.exists || user.data().status !== "active") {
    throw new HttpsError("permission-denied", "This teacher account is disabled.");
  }
  const classroomId = request.data?.classroomId;
  if (typeof classroomId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(classroomId)) {
    throw new HttpsError("invalid-argument", "A valid classroom ID is required.");
  }
  const classroom = await db.doc(`classrooms/${classroomId}`).get();
  if (!classroom.exists || classroom.data().teacherUid !== request.auth.uid) {
    throw new HttpsError("permission-denied", "You do not own this classroom.");
  }
  await liveDatabase().ref(`live/${classroomId}/teacherUid`).set(request.auth.uid);
  return { ready: true };
});

exports.joinClassroomByCode = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to join this classroom.");
  const { code, displayName } = request.data || {};
  if (typeof code !== "string" || !/^[A-Z0-9]{6}$/.test(code) ||
      typeof displayName !== "string" || displayName.trim().length < 1 || displayName.trim().length > 40) {
    throw new HttpsError("invalid-argument", "Enter a valid six character classroom code and a name up to 40 characters.");
  }

  const clientIp = request.rawRequest.ip || request.auth.uid;
  const throttleId = createHash("sha256").update(clientIp).digest("hex");
  const throttleRef = db.doc(`joinAttempts/${throttleId}`);
  const now = Date.now();
  const allowed = await db.runTransaction(async (transaction) => {
    const previous = await transaction.get(throttleRef);
    const data = previous.data();
    const withinWindow = data?.windowStartedAt && now - data.windowStartedAt.toMillis() < 10 * 60 * 1000;
    if (withinWindow && data.attempts >= 8) return false;
    transaction.set(throttleRef, {
      attempts: withinWindow ? data.attempts + 1 : 1,
      windowStartedAt: withinWindow ? data.windowStartedAt : FieldValue.serverTimestamp(),
      expiresAt: new Date(now + 24 * 60 * 60 * 1000),
    });
    return true;
  });
  if (!allowed) throw new HttpsError("resource-exhausted", "Too many join attempts. Wait ten minutes and try again.");

  const hash = createHash("sha256").update(code).digest("hex");
  const codeDoc = await db.doc(`joinCodes/${hash}`).get();
  if (!codeDoc.exists || codeDoc.data().status !== "active") {
    throw new HttpsError("not-found", "That code does not match an active classroom.");
  }
  const classroomId = codeDoc.data().classroomId;
  const classroom = await db.doc(`classrooms/${classroomId}`).get();
  if (!classroom.exists || classroom.data().status !== "active") {
    throw new HttpsError("failed-precondition", "This classroom is closed.");
  }

  const memberRef = db.doc(`classrooms/${classroomId}/members/${request.auth.uid}`);
  const activityRef = db.collection("activityLogs").doc();
  await db.runTransaction(async (transaction) => {
    const previous = await transaction.get(memberRef);
    const wasActive = previous.exists && previous.data().accessStatus === "active";
    transaction.set(memberRef, {
      sessionUid: request.auth.uid,
      displayName: displayName.trim(),
      joinedAt: wasActive ? previous.data().joinedAt : FieldValue.serverTimestamp(),
      accessStatus: "active",
      lastSeenAt: FieldValue.serverTimestamp(),
    });
    if (!wasActive) transaction.create(activityRef, {
      actorUid: request.auth.uid,
      actorName: displayName.trim(),
      action: "student_joined",
      targetType: "classroom",
      targetId: classroomId,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await liveDatabase().ref(`rosters/${classroomId}/${request.auth.uid}`).set(true);
  return { classroomId };
});

// Callable SDK requests preflight from browser origins. Keep local development
// and Firebase Hosting available while requiring callable Firebase Auth below;
// CORS is not used as an authorization check.
exports.provisionTeacherProfile = onCall({
  cors: [
    "http://localhost:5173",
    /^https:\/\/[a-z0-9-]+\.web\.app$/,
    /^https:\/\/[a-z0-9-]+\.firebaseapp\.com$/,
  ],
}, async (request) => {
  try {
    return await provisionTeacherProfile(request);
  } catch (error) {
    if (error instanceof HttpsError) throw error;

    // Keep unexpected Admin SDK / Firestore failures diagnosable in Cloud
    // Logging without exposing backend details or request data to the client.
    console.error("provisionTeacherProfile failed unexpectedly", {
      code: error?.code ?? "unknown",
      message: error?.message ?? "Unknown server error",
      stack: error?.stack,
    });

    if (error?.code === "unavailable" || error?.code === 14) {
      throw new HttpsError("unavailable", "Firebase profile storage is temporarily unavailable. Retry profile setup shortly.");
    }
    if (error?.code === "permission-denied" || error?.code === 7 || error?.code === "auth/insufficient-permission") {
      throw new HttpsError("failed-precondition", "The profile service lacks permission to update Firebase Auth or Firestore. Check the Cloud Functions service account permissions.");
    }
    throw new HttpsError("internal", "The teacher profile could not be confirmed. Your sign-in remains active. Check the provisionTeacherProfile Cloud Function logs before retrying.");
  }
});

async function provisionTeacherProfile(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in with a supported provider first.");
  const uid = request.auth.uid;
  if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) {
    throw new HttpsError("unauthenticated", "Firebase could not verify the signed-in user identity.");
  }
  const provider = request.auth.token.firebase?.sign_in_provider;
  const user = await auth.getUser(uid);
  const supported = ["password", "google.com"].includes(provider);
  if (!supported || user.isAnonymous) {
    throw new HttpsError("failed-precondition", "Sign in with email/password or Google to create a teacher profile.");
  }

  const profileRef = db.doc(`users/${uid}`);
  const profile = await profileRef.get();
  const existing = profile.data();
  if (existing?.role === "admin" || user.customClaims?.role === "admin") {
    throw new HttpsError("permission-denied", "This account is an administrator. Use the admin sign-in page.");
  }
  if (existing?.status === "disabled") {
    throw new HttpsError("permission-denied", "This teacher account is disabled. Contact an administrator.");
  }
  if (existing?.role && existing.role !== "teacher") {
    throw new HttpsError("permission-denied", "This account cannot be converted to a teacher account.");
  }

  if (!request.data || typeof request.data !== "object" || Array.isArray(request.data) ||
      (request.data.displayName !== undefined && typeof request.data.displayName !== "string") ||
      (request.data.phoneNumber !== undefined && typeof request.data.phoneNumber !== "string")) {
    throw new HttpsError("invalid-argument", "Provide the teacher name and phone number as text values.");
  }
  const requestedName = typeof request.data?.displayName === "string" ? request.data.displayName.trim() : "";
  const displayName = requestedName || user.displayName || existing?.displayName || "";
  if (displayName.length < 2 || displayName.length > 80) {
    throw new HttpsError("invalid-argument", "Enter a name between 2 and 80 characters.");
  }
  const requestedPhone = typeof request.data?.phoneNumber === "string" ? request.data.phoneNumber.trim() : "";
  const phoneNumber = requestedPhone || existing?.phoneNumber || "";
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    throw new HttpsError("invalid-argument", "Enter a valid phone number with its country code to finish your teacher profile.");
  }
  await profileRef.set({
    uid,
    displayName,
    email: user.email || null,
    phoneNumber,
    phoneNumberVerified: false,
    authProvider: provider,
    role: "teacher",
    status: "active",
    ...(!profile.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  // Publish the profile before the teacher claim; until the claim is
  // present, client rules still deny classroom access.
  await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), role: "teacher" });
  if (!profile.exists) await writeActivity(`teacher_registered_${uid}`, {
    actorUid: uid,
    actorName: displayName,
    action: "teacher_registered",
    targetType: "user",
    targetId: uid,
  });
  return { uid, role: "teacher" };
}

exports.leaveClassroom = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to leave this classroom.");
  const classroomId = request.data?.classroomId;
  if (typeof classroomId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(classroomId)) {
    throw new HttpsError("invalid-argument", "A valid classroom ID is required.");
  }
  const memberRef = db.doc(`classrooms/${classroomId}/members/${request.auth.uid}`);
  const member = await memberRef.get();
  if (!member.exists) throw new HttpsError("not-found", "Your classroom membership was not found.");
  await liveDatabase().ref(`rosters/${classroomId}/${request.auth.uid}`).remove();
  await memberRef.update({ accessStatus: "left", lastSeenAt: FieldValue.serverTimestamp() });
  return { left: true };
});

exports.removeClassroomMember = onCall(async (request) => {
  if (!request.auth || request.auth.token.role !== "admin" || request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "An administrator account is required.");
  }
  const caller = await db.doc(`users/${request.auth.uid}`).get();
  if (!caller.exists || caller.data().status !== "active") {
    throw new HttpsError("permission-denied", "This administrator account is disabled.");
  }
  const { classroomId, memberUid } = request.data || {};
  if (typeof classroomId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(classroomId) ||
      typeof memberUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(memberUid)) {
    throw new HttpsError("invalid-argument", "A valid classroom and member are required.");
  }
  const memberRef = db.doc(`classrooms/${classroomId}/members/${memberUid}`);
  const member = await memberRef.get();
  if (!member.exists) throw new HttpsError("not-found", "The classroom member was not found.");
  await liveDatabase().ref(`rosters/${classroomId}/${memberUid}`).remove();
  await memberRef.update({ accessStatus: "removed", lastSeenAt: FieldValue.serverTimestamp() });
  await writeActivity(`member_removed_${classroomId}_${memberUid}_${Date.now()}`, {
    actorUid: request.auth.uid,
    actorName: caller.data().displayName || "Administrator",
    action: "member_removed",
    targetType: "classroom",
    targetId: classroomId,
  });
  return { removed: true };
});

exports.setTeacherStatus = onCall(async (request) => {
  if (!request.auth || request.auth.token.role !== "admin" || request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "An administrator account is required.");
  }
  const caller = await db.doc(`users/${request.auth.uid}`).get();
  if (!caller.exists || caller.data().status !== "active") {
    throw new HttpsError("permission-denied", "This administrator account is disabled.");
  }
  const { uid, status } = request.data || {};
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !["active", "disabled"].includes(status)) {
    throw new HttpsError("invalid-argument", "Provide a teacher UID and a valid account status.");
  }
  const targetRef = db.doc(`users/${uid}`);
  const target = await targetRef.get();
  if (!target.exists || target.data().role !== "teacher") {
    throw new HttpsError("not-found", "The teacher account was not found.");
  }
  const user = await auth.getUser(uid);
  if (target.data().status === status) return { uid, status };
  const claims = { ...(user.customClaims || {}), role: status === "active" ? "teacher" : "disabled" };
  const profileUpdate = { status, updatedAt: FieldValue.serverTimestamp() };
  if (status === "active") {
    await targetRef.update(profileUpdate);
    await auth.setCustomUserClaims(uid, claims);
  } else {
    await auth.setCustomUserClaims(uid, claims);
    await targetRef.update(profileUpdate);
  }
  await auth.revokeRefreshTokens(uid);
  await writeActivity(`teacher_${uid}_${status}_${Date.now()}`, {
    actorUid: request.auth.uid,
    actorName: caller.data().displayName || "Administrator",
    action: status === "active" ? "teacher_activated" : "teacher_deactivated",
    targetType: "user",
    targetId: uid,
  });
  return { uid, status };
});

exports.updateTeacherProfile = onCall(async (request) => {
  if (!request.auth || request.auth.token.role !== "admin" || request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "An administrator account is required.");
  }
  const caller = await db.doc(`users/${request.auth.uid}`).get();
  if (!caller.exists || caller.data().status !== "active") {
    throw new HttpsError("permission-denied", "This administrator account is disabled.");
  }
  const { uid, displayName, phoneNumber } = request.data || {};
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) ||
      typeof displayName !== "string" || displayName.trim().length < 2 || displayName.trim().length > 80 ||
      typeof phoneNumber !== "string" || !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    throw new HttpsError("invalid-argument", "Provide a teacher UID, full name, and valid phone number with country code.");
  }
  const targetRef = db.doc(`users/${uid}`);
  const target = await targetRef.get();
  if (!target.exists || target.data().role !== "teacher") {
    throw new HttpsError("not-found", "The teacher account was not found.");
  }
  await auth.updateUser(uid, { displayName: displayName.trim() });
  await targetRef.update({
    displayName: displayName.trim(),
    phoneNumber: phoneNumber.trim(),
    phoneNumberVerified: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeActivity(`teacher_profile_${uid}_${Date.now()}`, {
    actorUid: request.auth.uid,
    actorName: caller.data().displayName || "Administrator",
    action: "teacher_profile_updated",
    targetType: "user",
    targetId: uid,
  });
  return { uid, updated: true };
});

exports.createTeacherAccount = onCall(async (request) => {
  if (!request.auth || request.auth.token.role !== "admin" || request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "An administrator account is required.");
  }

  const caller = await db.doc(`users/${request.auth.uid}`).get();
  if (!caller.exists || caller.data().status !== "active") {
    throw new HttpsError("permission-denied", "This administrator account is disabled.");
  }

  const { displayName, email, phoneNumber } = request.data || {};
  if (typeof displayName !== "string" || displayName.trim().length < 2 || displayName.trim().length > 80 ||
      typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof phoneNumber !== "string" || !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    throw new HttpsError("invalid-argument", "Provide a name, valid email, and phone number with country code.");
  }

  let user;
  try {
    user = await auth.createUser({ email: email.trim().toLowerCase(), displayName: displayName.trim() });
    await auth.setCustomUserClaims(user.uid, { role: "teacher" });
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid,
      displayName: displayName.trim(),
      invitedEmail: user.email,
      role: "teacher",
      phoneNumber: phoneNumber.trim(),
      phoneNumberVerified: false,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await writeActivity(`teacher_created_${user.uid}`, {
      actorUid: request.auth.uid,
      actorName: caller.data().displayName || "Administrator",
      action: "teacher_created",
      targetType: "user",
      targetId: user.uid,
    });
    const setupLink = await auth.generatePasswordResetLink(user.email);
    return { uid: user.uid, setupLink };
  } catch (error) {
    if (user) {
      await auth.deleteUser(user.uid).catch(() => {});
      await db.doc(`users/${user.uid}`).delete().catch(() => {});
    }
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "An account with this email already exists. Contact an administrator to provision it.");
    }
    console.error("createTeacherAccount failed", error.code || "unknown");
    throw new HttpsError("internal", "The teacher account could not be created. Check function logs for the error code.");
  }
});
