# ClassBoard Publish Workflow Report

## Implemented

- Teachers can choose **Selected slide** or **Complete presentation** and publish without starting a live class.
- The Publish button reports `Publish`, `Publishing…`, or `Published`. Errors are shown separately. A repeat publish asks for confirmation before updating existing student-visible content. Blank slides require explicit confirmation.
- Publication writes a Firestore snapshot at `classrooms/{classroomId}/publishedSlides/{slideId}`. The document ID and `slideId` are the existing stable page ID, so republishing updates that record rather than adding a duplicate.
- Published records retain classroom/lesson IDs, title, order, page number, Fabric snapshot, imported-file references, source version, publisher, publication timestamps, and display metadata. Snapshots above 800,000 UTF-8 bytes are rejected, consistent with the existing page-snapshot limit and below Firestore's 1 MiB document limit.
- Students have a **Published slides** reader with slide selection and previous/next controls. It renders the saved snapshot and displays lesson, teacher, slide, and publication information. The existing published-lesson reader remains available for older lessons. Neither student view exposes editing, upload, export, or download controls.
- Confirmed published snapshots are added to the existing per-user/per-classroom IndexedDB offline bundle. Live session state and live-board snapshots remain on their existing separate path; publishing does not start or stop a live session.

## Security rules

`firestore.rules` now defines `classrooms/{classroomId}/publishedSlides/{slideId}`. Only the active teacher who owns the active classroom can create, update, or delete those records. Rules validate the stable IDs, classroom and source-page relationship, allowed fields, content size, publisher UID, timestamps, and metadata. A student must be an active classroom member and the document must have `published == true` to read it. Unmatched writes remain denied.

Rules were **not deployed**. After reviewing the rules, deploy them with:

```sh
firebase deploy --only firestore:rules --project digital-classroom-aa170
```

## Files changed

- `src/services/publishedSlides.ts` — idempotent publish/update, published-slide subscriptions and reads, blank/size checks.
- `src/services/publishedSlides.test.ts` — publication, stable IDs/order, update-in-place, blank confirmation, and published-only read tests.
- `src/pages/teacher/WhiteboardEditor.tsx` — scope selector, Publish action, update/blank confirmations, success/error/loading states.
- `src/pages/StudentClassroom.tsx` — published-slide selector/viewer, previous/next navigation, and saved-content status.
- `src/services/studentOfflineCache.ts` — caches only the published-slide records already authorized by a server-confirmed classroom membership.
- `firestore.rules` — owner-only publication writes and member-only published reads.
- `CLASSBOARD_PUBLISH_WORKFLOW_REPORT.md` — this report.

## Verification

- `npx tsc --noEmit` — passed.
- `npm test` — passed: 12 test files, 76 tests.
- `npm run build` — passed. Vite emitted two existing dependency annotation warnings from Zod; output was generated successfully.
- No Firebase rules emulator test was run: the repository does not include `@firebase/rules-unit-testing`. `firebase emulators:exec --only firestore "true" --project digital-classroom-aa170` also could not start because Firebase CLI requires Java 21 or newer while the available Java runtime is older (the CLI additionally reported it could not update its local config under `~/.config`). The new rule behavior therefore still needs emulator or deployed-project validation.
- No real Firebase publish/read session or separate teacher/student browser test was performed. Live synchronization was not retested; publishing uses Firestore and does not alter the live-session implementation.

## Manual checks remaining

1. Deploy the Firestore rules command above.
2. In a non-production classroom, publish one saved slide, refresh as an authorized student, and verify the snapshot and updated version appear while the live class is inactive.
3. Publish the complete presentation, republish one slide, and confirm the same slide document is updated.
4. Verify a non-member cannot read the published-slide collection and a student cannot create/update/delete a published slide. Use the Firestore Emulator Suite or test accounts in a dedicated Firebase project.
5. Check the browser's offline mode after the student has loaded published slides online; the local copy is intentionally available only after server-confirmed membership and publication data.

Publishing remains independent of Cloud Functions and Firebase Storage. Legacy slides that reference a Storage path still depend on the existing Storage rules and availability; the new publish flow does not upload or migrate files.
