/**
 * Features requiring trusted Firebase Functions are disabled by default on
 * Spark. Set VITE_FIREBASE_FUNCTIONS_ENABLED=true only after deploying the
 * matching trusted functions to the configured Firebase project.
 */
export const trustedFunctionsEnabled = import.meta.env.VITE_FIREBASE_FUNCTIONS_ENABLED === "true";
