# ClassBoard Whiteboard, Upload and Offline Reading Report

## Confirmed findings

- **Upload failure:** The editor’s previous import path rendered pages and then uploaded every PNG to Firebase Storage using `uploadBytesResumable`. Firebase’s current Storage documentation states that Cloud Storage for Firebase now requires Blaze, and requests from Spark projects can fail with 402/403. The project is on Spark per the supplied project information. This explains the plan-level blocker in that code path; I could not execute the authenticated upload from this environment to capture its exact HTTP response. Firebase says existing bucket data remains stored but inaccessible while the project is Spark. [Firebase Storage billing changes](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024?hl=en)
- **Spark-compatible alternative:** New PDF/image imports no longer call Storage. PDF pages are rasterized one at a time, compressed to a bounded JPEG data URL, and saved atomically in the same Firestore page document as the stable slide metadata. A per-page 800,000-byte UTF-8 limit is checked in client code and Firestore rules; individual imported image data is capped before serialization. This supports modest pages under Spark’s Firestore service, but it does not retain the original uploaded PDF binary. Files/pages that cannot fit receive an actionable size error; use smaller source pages or split the PDF.
- **Legacy Storage content:** Existing pages and objects were not deleted or rewritten. Old snapshots that reference Firebase Storage download URLs may still fail to render on Spark because Firebase says Storage access is blocked there. They require the bucket to be accessible again or a separately authorized export/migration; no automatic migration was attempted.
- **Slide persistence:** New pages use their Firestore document IDs as stable slide IDs and now store classroom/lesson IDs, title, order, source filename/type, creator, schema version, timestamps and snapshot. Reordering preserves IDs. Legacy pages continue to read using their Firestore path ID and fallback metadata.
- **Student download control:** The student lesson viewer no longer offers PDF export/download. It remains read-only and only subscribes to lessons filtered as published; Firestore rules also require active classroom membership and publication for page reads. Content already delivered to a browser can still be copied or screenshotted; this is not DRM.
- **Offline behavior:** Firestore SDK global persistence was not enabled because that cache would retain every queried document type (potentially including admin/teacher data). Instead, a per-UID/per-classroom IndexedDB cache stores only classroom metadata, lessons returned by the published-only query, pages read after membership was server-confirmed, and the last authorized live snapshot. It is cleared on explicit leave and when reconnection confirms membership revoked or classroom closed. The UI identifies offline/stale content and reports when IndexedDB is unavailable. Cache size/quota is browser-dependent.
- **Board growth:** The canvas retains its existing bounded 1280×720 logical page. The explicit multi-slide workflow (add, duplicate, delete with confirmation, reorder, previous/next, zoom and fit) remains available. There is no unbounded canvas; use another slide when content exceeds the page.
- **Permissions:** Local Firestore rules validate bounded page snapshots and immutable page ownership metadata, and validate lesson create/update schema. Student page reads remain publication- and membership-gated; student writes are not granted. Storage rules remain restrictive and unchanged. Realtime Database is not used for board live state; the existing Firestore live path remains owner-write/member-read.

## Files changed

- `src/pages/teacher/WhiteboardEditor.tsx` — Spark-compatible file-to-slide processing, progress, cancel, per-page persistence, clearer errors and explicit save control.
- `src/lib/pdfjs.ts` — bounded sequential PDF page rendering, cancellation checks, image compression helper.
- `src/services/pages.ts` — source file metadata, atomic imported page snapshots, size checks, and cleanup of unreferenced legacy Storage files when a slide is intentionally deleted. A legacy file cleanup failure is surfaced separately after slide removal.
- `src/services/pages.test.ts` — stable ID/content persistence, inline slide removal, reordering, conflict and size coverage.
- `src/services/storage.ts` — legacy Storage object deletion helper only; the new import flow does not upload to Storage.
- `src/utils/validation.ts`, `src/utils/validation.test.ts` — MIME/extension recognition for PDF, PNG, JPG/JPEG and WebP with size checks.
- `src/utils/uploadErrors.ts`, `src/utils/uploadErrors.test.ts` — actionable plan, permission, network, invalid PDF and size messages.
- `src/services/lessons.ts`, `src/services/lessons.test.ts` — classroom ID, description and teacher metadata; server-confirmed snapshot metadata for cache decisions.
- `src/pages/teacher/ClassroomDetail.tsx` — lesson description field during creation.
- `src/types/index.ts` — lesson metadata and source-file metadata types.
- `firestore.rules` — exact new lesson schema/update constraints and slide source metadata validation while retaining legacy page reads.
- `src/services/studentOfflineCache.ts`, `src/services/studentOfflineCache.test.ts` — authorized, per-student/classroom IndexedDB cache and clear behavior.
- `src/pages/StudentClassroom.tsx` — saved notes/live split, cached offline restoration/status, lesson metadata, live state retention, and removal of student PDF export/download controls.
- `src/context/AuthContext.tsx` — retains a minimal anonymous-student profile on offline profile-listener failure so authorized cached reading can render.
- `CLASSBOARD_WHITEBOARD_REPAIR_REPORT.md` — this updated report.

## Persistence, publication and access

Lessons live at `classrooms/{classroomId}/lessons/{lessonId}`; pages live at `classrooms/{classroomId}/lessons/{lessonId}/pages/{pageId}`. Each lesson stores classroom ID, owner UID, title, description, creation/update timestamps, publication state and page count. Page snapshots preserve Fabric objects and imported page images. Imported PDF files are split into ordered raster slides; the original PDF bytes and their metadata-only file reference are not retained remotely under this Spark-compatible implementation.

Teacher edits continue to autosave with version checks and a visible save failure/reload conflict path. Students use separate read-only Live board and Lesson notes views. Published lesson/page reads require an active persisted membership. The offline cache is written only after the server confirms classroom, membership and published-lesson reads. It is scoped by Firebase UID and classroom, but local browser storage is not a security boundary against someone with access to that same browser profile.

## Firebase configuration and manual steps

- No Cloud Functions, Blaze upgrade, service-account credential, public rule, or data migration was introduced.
- `storage.rules` remains owner-write and authorized-member-read for legacy assets. New imports avoid that bucket. Existing legacy Storage uploads cannot be guaranteed to load or be cleaned up on Spark; delete cleanup reports failure rather than pretending it succeeded.
- Deploy the updated Firestore rules to the intended project before testing page/lesson writes:

  ```sh
  firebase deploy --only firestore:rules --project digital-classroom-aa170
  ```

- Verify the CLI target and project access before deploying. Rules deployment and inspection of production Firestore documents were not performed in this session.

## Verification

Final local commands:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed, exit code 0 |
| `npm test` | Passed: 11 test files, 71 tests |
| `npm run build` | Passed; Vite produced `dist/index.html` |
| `npm run` | No lint script is configured |

The build reports non-fatal Zod dependency `@__PURE__` annotation warnings. Tests cover code-level file validation/error mapping, stable slide IDs and snapshots, ordering/size/conflict behavior, and offline cache scoping/clearing. No Storage upload was tested against Firebase, no Firestore/Storage emulator rule test suite is configured, and no two-browser live test was performed. Firebase CLI reports version 15.34.0 but exits with an error because it cannot access its local update config store (`/Users/prince/.config`); therefore emulator startup/rules parsing was not available in this session. Remote Storage restrictions, deployed rule enforcement, real published student reads, actual browser offline recovery and teacher/student live synchronization remain unverified.

## Remaining blockers and limits

1. The Spark plan cannot use Firebase Cloud Storage under current Firebase policy. New modest imported pages use bounded Firestore snapshots; larger PDFs/images are rejected by design. To use direct Storage again, the project owner must decide whether to enable billing; this implementation does not require or perform that upgrade.
2. Existing Storage-backed slide assets may be inaccessible until the bucket can be accessed. They were preserved, not migrated.
3. Firestore rules are local changes and must be deployed before the new page and lesson payloads are accepted.
4. Offline lesson cache is bounded by the browser’s IndexedDB quota; no offline cache is promised if the browser rejects storage.
5. End-to-end checks requiring Firebase credentials, deployed rules, separate student/teacher sessions, and actual browser network interruption are still outstanding.
