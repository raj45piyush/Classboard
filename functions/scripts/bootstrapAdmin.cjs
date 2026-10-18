#!/usr/bin/env node
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const fs = require("node:fs");
const path = require("node:path");

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main() {
  const projectId = arg("project");
  const confirmedProject = arg("confirm-project");
  const email = arg("email")?.trim().toLowerCase();
  const uid = arg("uid");
  if (!projectId || confirmedProject !== projectId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Usage: node functions/scripts/bootstrapAdmin.cjs --project PROJECT_ID --confirm-project PROJECT_ID --email EXISTING_AUTH_EMAIL [--uid EXPECTED_UID]");
  }

  const envPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, "utf8");
    const configuredProject = envText.match(/^\s*VITE_FIREBASE_PROJECT_ID\s*=\s*['\"]?([^'\"\s#]+)['\"]?\s*$/m)?.[1];
    if (configuredProject && configuredProject !== projectId) {
      throw new Error("The requested project does not match VITE_FIREBASE_PROJECT_ID in the repository .env; no changes were made.");
    }
  }
  if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
    throw new Error("The requested project does not match GCLOUD_PROJECT; no changes were made.");
  }

  const app = initializeApp({ credential: applicationDefault(), projectId });
  try {
    const auth = getAuth(app);
    const user = await auth.getUserByEmail(email);
    if (uid && user.uid !== uid) throw new Error("The Auth user's UID does not match --uid; no changes were made.");
    if (!user.emailVerified) throw new Error("Verify this existing Auth user's email in Firebase Authentication before provisioning admin access.");

    const claims = { ...(user.customClaims || {}), role: "admin" };
    await auth.setCustomUserClaims(user.uid, claims);
    const profileRef = getFirestore(app).doc(`users/${user.uid}`);
    const profile = await profileRef.get();
    await profileRef.set({
      uid: user.uid,
      displayName: user.displayName || "Administrator",
      email: user.email,
      role: "admin",
      status: "active",
      ...(!profile.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    process.stdout.write(`Administrator role provisioned for ${email} in project ${projectId}. Sign out and sign in again to refresh the role claim.\n`);
  } finally {
    await app.delete();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
