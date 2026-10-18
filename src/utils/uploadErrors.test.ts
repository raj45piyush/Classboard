import { describe, expect, it } from "vitest";
import { getUploadErrorMessage } from "./uploadErrors";

describe("upload error messages", () => {
  it("explains the Spark Storage restriction without disguising permission errors", () => {
    expect(getUploadErrorMessage(Object.assign(new Error("denied"), { code: "storage/unauthorized" }))).toContain("Spark");
    expect(getUploadErrorMessage(Object.assign(new Error("denied"), { code: "permission-denied" }))).toContain("Firestore denied");
  });

  it("distinguishes network, unreadable PDF and size failures", () => {
    expect(getUploadErrorMessage(Object.assign(new Error(), { code: "unavailable" }))).toContain("network");
    expect(getUploadErrorMessage(Object.assign(new Error("PasswordException"), { name: "PasswordException" }))).toContain("password-protected");
    expect(getUploadErrorMessage(new Error("BOARD_SNAPSHOT_TOO_LARGE"))).toContain("Firestore page limit");
  });
});
