function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : undefined;
}

export function getUploadErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === "permission-denied" || code === "firestore/permission-denied") return "Firestore denied saving this slide. Confirm you own this classroom and that the current Firestore rules are deployed.";
  if (code === "storage/unauthorized") return "Firebase Storage rejected access. If this project is on Spark, Storage operations are blocked by Firebase's current plan requirement. This importer stores compressed page snapshots in Firestore; old Storage-backed slides need bucket access to load.";
  if (code === "storage/bucket-not-found" || code === "storage/no-default-bucket") return "Firebase Storage has no accessible bucket configured. New imports use the Spark-compatible compressed slide path; legacy Storage files need a valid bucket.";
  if (code === "storage/canceled") return "Storage upload cancelled.";
  if (code === "unavailable" || code === "storage/retry-limit-exceeded" || code === "network-request-failed") return "The service or network is unavailable. Check your connection and retry.";
  const message = error instanceof Error ? `${error.name} ${error.message}` : "";
  if (/InvalidPDFException|PasswordException|Invalid PDF/i.test(message)) return "This PDF could not be read. Check that it is valid and not password-protected.";
  if (error instanceof Error && error.message === "IMPORTED_IMAGE_TOO_LARGE") return "This image could not be compressed enough for a Spark-compatible slide. Reduce its dimensions or file size and retry.";
  if (error instanceof Error && error.message === "PDF_PAGE_LIMIT") return "A single PDF import is limited to 60 pages. Split the PDF into smaller files and import them separately.";
  if (error instanceof Error && error.message === "BOARD_SNAPSHOT_TOO_LARGE") return "This imported slide is too large for the Firestore page limit. Use a smaller image or split/reduce the PDF pages.";
  if (error instanceof Error && error.message) return `Import failed: ${error.message}`;
  return "The file could not be imported. Check its type, size, classroom permissions and network, then retry.";
}
