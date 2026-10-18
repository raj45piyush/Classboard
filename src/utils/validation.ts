import { z } from "zod";

export const emailSchema = z.string().trim().min(1, "Email is required").email("Enter a valid email address");

export const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

export const teacherLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const teacherRegistrationSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your full name").max(80, "Name is too long"),
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password is too long"),
  confirmPassword: z.string(),
  phoneNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Enter a valid phone number with country code"),
  consent: z.literal(true, { error: "Consent is required to create an account" }),
}).refine((values) => values.password === values.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// Spark-compatible joins use a high-entropy share code so rules can validate
// it without a rate-limited Cloud Function.
export const JOIN_CODE_REGEX = /^[A-HJ-NP-Z2-9]{16}$/;

export const joinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, "Enter the student join code shared by your teacher")
  .regex(
    JOIN_CODE_REGEX,
    "Enter the 16-character student join code (A–Z except I/O, and 2–9). The Firestore classroom ID is not a join code."
  );

export const joinClassroomSchema = z.object({
  code: joinCodeSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a display name")
    .max(40, "Name is too long"),
});

export const classroomFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(80, "Title is too long"),
  subject: z.string().trim().max(60, "Subject is too long").optional().default(""),
  description: z.string().trim().max(300, "Description is too long").optional().default(""),
});

export const lessonFormSchema = z.object({
  title: z.string().trim().min(1, "Lesson title is required").max(80, "Title is too long"),
  description: z.string().trim().max(300, "Description is too long").optional().default(""),
  boardMode: z.enum(["blank", "slides"]),
});

export const teacherAccountSchema = z.object({
  displayName: z.string().trim().min(2, "Enter the teacher's full name").max(80),
  email: emailSchema,
  phoneNumber: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Enter a valid phone number with country code"),
});

// File upload constraints (also enforced in Storage rules / server side where possible)
export const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
export const ACCEPTED_PDF_TYPES = ["application/pdf"];
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export function validateUploadFile(file: File): { ok: true; kind: "pdf" | "image"; mimeType: string } | { ok: false; error: string } {
  const extension = file.name.toLowerCase().split(".").pop();
  const isPdf = ACCEPTED_PDF_TYPES.includes(file.type) || (!file.type && extension === "pdf");
  const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type) || (!file.type && ["png", "jpg", "jpeg", "webp"].includes(extension ?? ""));

  if (!isPdf && !isImage) {
    return { ok: false, error: "Only PDF, PNG, JPEG or WEBP files are supported." };
  }
  if (isPdf && file.size > MAX_PDF_SIZE_BYTES) {
    return { ok: false, error: "PDF files must be smaller than 20 MB." };
  }
  if (isImage && file.size > MAX_IMAGE_SIZE_BYTES) {
    return { ok: false, error: "Images must be smaller than 8 MB." };
  }
  if (file.size === 0) {
    return { ok: false, error: "The selected file is empty." };
  }
  return { ok: true, kind: isPdf ? "pdf" : "image", mimeType: isPdf ? "application/pdf" : file.type === "image/webp" ? "image/webp" : file.type === "image/png" ? "image/png" : "image/jpeg" };
}

export function flattenZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? issue.message : "Invalid input";
}
