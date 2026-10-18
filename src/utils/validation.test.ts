import { describe, expect, it } from "vitest";
import {
  joinClassroomSchema,
  joinCodeSchema,
  classroomFormSchema,
  teacherRegistrationSchema,
  validateUploadFile,
} from "./validation";

describe("joinClassroomSchema", () => {
  it("accepts a valid code and name", () => {
    const result = joinClassroomSchema.safeParse({ code: "abcdefghjklmnpqr", displayName: "Riya" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("ABCDEFGHJKLMNPQR");
    }
  });

  it("rejects a code with the wrong length", () => {
    const result = joinClassroomSchema.safeParse({ code: "AB1", displayName: "Riya" });
    expect(result.success).toBe(false);
  });

  it("normalizes surrounding whitespace and lowercase from a generated code", () => {
    const result = joinCodeSchema.safeParse("  abcdefghjklmnpqr  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("ABCDEFGHJKLMNPQR");
  });

  it("explains that a Firestore classroom ID is not a student join code", () => {
    const result = joinCodeSchema.safeParse("a1b2c3d4e5f6g7h8j9k0");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Firestore classroom ID");
    }
  });

  it("reports an empty code separately", () => {
    const result = joinCodeSchema.safeParse("   ");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toContain("Enter the student join code");
  });

  it("rejects an empty display name", () => {
    const result = joinClassroomSchema.safeParse({ code: "ABCDEFGHJKLMNPQR", displayName: "  " });
    expect(result.success).toBe(false);
  });
});

describe("classroomFormSchema", () => {
  it("requires a title", () => {
    const result = classroomFormSchema.safeParse({ title: "", subject: "Physics" });
    expect(result.success).toBe(false);
  });

  it("allows an empty subject", () => {
    const result = classroomFormSchema.safeParse({ title: "Grade 10 - A", subject: "" });
    expect(result.success).toBe(true);
  });
});

describe("teacherRegistrationSchema", () => {
  const valid = {
    displayName: "Riya Sharma",
    email: "riya@example.com",
    phoneNumber: "+919876543210",
    password: "correct-horse-battery",
    confirmPassword: "correct-horse-battery",
    consent: true,
  };

  it("accepts matching credentials and consent", () => {
    expect(teacherRegistrationSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    expect(teacherRegistrationSchema.safeParse({ ...valid, confirmPassword: "different-password" }).success).toBe(false);
  });

  it("requires consent", () => {
    expect(teacherRegistrationSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
  });

  it("requires a valid phone number with a country calling code", () => {
    expect(teacherRegistrationSchema.safeParse({ ...valid, phoneNumber: "9876543210" }).success).toBe(false);
  });
});

describe("validateUploadFile", () => {
  function makeFile(name: string, type: string, size: number): File {
    const blob = new Blob([new Uint8Array(size)], { type });
    return new File([blob], name, { type });
  }

  it("rejects unsupported file types", () => {
    const file = makeFile("notes.txt", "text/plain", 100);
    const result = validateUploadFile(file);
    expect(result.ok).toBe(false);
  });

  it("accepts a valid small PDF", () => {
    const file = makeFile("slides.pdf", "application/pdf", 1024);
    const result = validateUploadFile(file);
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ kind: "pdf", mimeType: "application/pdf" });
  });

  it.each(["image/png", "image/jpeg", "image/webp"])("accepts supported image MIME type %s", (type) => {
    expect(validateUploadFile(makeFile("slide", type, 1024))).toMatchObject({ ok: true, kind: "image" });
  });

  it("recognizes a JPEG file by extension when the browser omits MIME type", () => {
    expect(validateUploadFile(makeFile("photo.JPG", "", 1024))).toMatchObject({ ok: true, mimeType: "image/jpeg" });
  });

  it("rejects an oversized image", () => {
    const file = makeFile("photo.png", "image/png", 9 * 1024 * 1024);
    const result = validateUploadFile(file);
    expect(result.ok).toBe(false);
  });
});
