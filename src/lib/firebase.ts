// Single place where the Firebase app and all services are initialized.
// Import the exported services from here instead of calling initializeApp()
// anywhere else in the app.

import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getDatabase, type Database } from "firebase/database";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, type Functions } from "firebase/functions";

const REQUIRED_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_DATABASE_URL",
] as const;

export interface MissingConfigInfo {
  missing: string[];
}

const PLACEHOLDER_PATTERN = /^(?:your[-_ ]?|replace(?:[-_ ]?me)?|placeholder|example|fake|insert[-_ ]|<.*>|xxx)/i;

function readEnv() {
  const env = import.meta.env;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: env.VITE_FIREBASE_APP_ID as string | undefined,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL as string | undefined,
  };
}

/** Returns the list of required env vars that are missing or blank. */
export function getMissingConfigKeys(): string[] {
  const env = import.meta.env;
  return REQUIRED_KEYS.filter((key) => {
    const value = env[key];
    return typeof value !== "string" || value.trim().length === 0 || PLACEHOLDER_PATTERN.test(value.trim());
  });
}

export function getFirebaseConfigError(): string | null {
  const missing = getMissingConfigKeys();
  if (missing.length) return `Set valid values for: ${missing.join(", ")}.`;
  const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL as string;
  try {
    const parsed = new URL(databaseURL);
    if (/\b(your|example|placeholder|changeme|fake)\b/i.test(parsed.hostname)) {
      return "VITE_FIREBASE_DATABASE_URL still contains placeholder text. Copy the actual HTTPS URL from Firebase Console → Realtime Database.";
    }
    if (parsed.protocol !== "https:" || (!parsed.hostname.endsWith(".firebasedatabase.app") && !parsed.hostname.endsWith(".firebaseio.com"))) {
      return "VITE_FIREBASE_DATABASE_URL must be the HTTPS URL shown for your Firebase Realtime Database instance (Firebase Console → Realtime Database).";
    }
  } catch {
    return "VITE_FIREBASE_DATABASE_URL is not a valid URL. Copy the HTTPS database URL from Firebase Console → Realtime Database.";
  }
  return null;
}

export const isFirebaseConfigured = getFirebaseConfigError() === null;

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let rtdbInstance: Database | null = null;
let storageInstance: FirebaseStorage | null = null;
let functionsInstance: Functions | null = null;

if (isFirebaseConfigured) {
  const config = readEnv();
  app = getApps().some((candidate) => candidate.name === "[DEFAULT]")
    ? getApp()
    : initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
        databaseURL: config.databaseURL,
      });

  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
  rtdbInstance = getDatabase(app);
  storageInstance = getStorage(app);
  // Keep callable endpoints aligned with the Functions deployment region.
  functionsInstance = getFunctions(app, "us-central1");
}

/**
 * These will be null if Firebase has not been configured yet (missing .env values).
 * Always check `isFirebaseConfigured` (or use <ConfigGate>) before using them.
 */
export const firebaseApp = app;
export const auth = authInstance as Auth;
export const db = dbInstance as Firestore;
export const rtdb = rtdbInstance as Database;
export const storage = storageInstance as FirebaseStorage;
export const functions = functionsInstance as Functions;
