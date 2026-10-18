# ClassBoard Join, Lessons, and Live Board Fix Report

## Findings and status

| Area | Finding | Status |
|---|---|---|
| Join code validation | Join accepts the separate 16-character share code, not the Firestore classroom document ID. Generated codes use `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; code normalization is case-insensitive and trims surrounding whitespace. The page previously truncated URL values to 16 characters and showed a generic format error. | Fixed in the client; unit tested |
| Teacher lessons | The page used a collection-group query over every classroom, filtered only by the lesson's `teacherUid`. Firestore rules authorize the teacher through the parent classroom owner record. That query did not scope results to classrooms the user owns, so the listener could be denied by rules. | Replaced with owner-scoped classroom query followed by per-classroom lesson listeners |
| Classroom detail | The page started lesson and member listeners before confirming the loaded classroom was owned by the signed-in teacher. The single banner also combined failures from separate subscriptions. | Related reads now wait until the current classroom document confirms ownership. Specific resource errors remain visible. Remote cause for a particular prior denial could not be confirmed without the denied request's path, UID, and deployed-rule result. |
| Live board | The active implementation uses Firestore live session and live-page documents, not Realtime Database or Cloud Functions. Its rules can validate the classroom owner and active member from Firestore records. Saved page snapshots are persisted separately under lesson pages. | Spark-compatible source path present; actual two-browser delivery not verified |

## Join code behavior

The field accepts the 16-character student join code created by `generateJoinCode()`. It does not accept the Firestore classroom ID. The generated alphabet omits ambiguous `I`, `O`, `0`, and `1`; lower-case input is uppercased and surrounding whitespace is trimmed. URLs are no longer silently truncated. Empty, malformed, unavailable/rotated, and membership-permission-denied cases now have separate messages. Missing, expired, and rotated code documents intentionally remain indistinguishable at lookup so clients cannot enumerate active classrooms.

The exact value shown in the screenshot was not available as text, so this report does not infer whether it was a classroom document ID or a share code containing excluded characters.

## Permission and data paths reviewed

- Teacher classroom list: `classrooms` query constrained by `teacherUid == authenticated UID`; rules require the caller's active teacher profile and matching document owner.
- Teacher lessons page: now lists that teacher's classrooms, then reads `classrooms/{classroomId}/lessons`; the nested lesson read rule checks the parent classroom owner. This includes legacy lesson documents without a `teacherUid` field.
- Classroom detail: reads `classrooms/{classroomId}`, then the owner's `lessons` and `members` subcollections only after the classroom document confirms ownership. Member reads are owner-only (or the user's own membership/admin).
- Student lessons/pages: the rules permit reads only for an active classroom member and published lessons; page reads additionally require the parent lesson to be published.
- Student membership create: `classrooms/{classroomId}/members/{auth.uid}` requires an active hashed join-code document that points to that active classroom. The client cannot choose another UID or write teacher board content.
- Live state: `classrooms/{classroomId}/live/session` and `livePages/{pageId}`. Teachers write only when their profile owns the classroom; active members read; students have no write rule.
- Saved board pages: `classrooms/{classroomId}/lessons/{lessonId}/pages/{pageId}`. Teacher ownership is required to write. Student reads require active membership and a published lesson.
- Slide storage: `classrooms/{classroomId}/lessons/{lessonId}/pages/{pageId}/{fileName}`; teacher uploads are type/size limited and student reads require active membership, an active classroom, and a published lesson.
- Realtime Database: the app's current live service does not use it. Its root rules deny reads and writes, while its nested rules depend on custom claims/rosters. I left those rules unchanged rather than granting client access that current Spark architecture cannot securely establish.

No Firestore, Realtime Database, or Storage security rules were loosened or changed in this fix. The existing Firestore rules already express the ownership and membership checks needed for the path-scoped queries and Firestore live data. These rules were inspected locally, not revalidated against the deployed project.

## Files changed

- `src/utils/validation.ts` — specific empty/invalid join-code validation messages and normalization.
- `src/pages/JoinClassroom.tsx` — clearly identifies share code vs classroom ID, removes URL truncation, and reports lookup vs membership permission failures.
- `src/services/members.ts` — distinguishes code lookup denial from membership-write denial and checks stored code length.
- `src/utils/validation.test.ts` — tests a generated-format example, whitespace/case normalization, empty input, and a classroom-ID-like input.
- `src/services/members.test.ts` — tests unavailable/rotated code lookup and denied membership writes.
- `src/services/lessons.ts` — replaces the broad collection-group listener with teacher-owned classroom and nested lesson listeners; cleans up listeners and reports a single failure.
- `src/services/lessons.test.ts` — verifies the owner filter and that only nested owner-scoped lesson paths are queried.
- `src/pages/teacher/TeacherLessons.tsx` — clears stale errors, ends loading after listener failure, and preserves already-loaded rows.
- `src/pages/teacher/ClassroomDetail.tsx` — resets classroom-scoped state when the route changes and waits for ownership confirmation before reading lessons or members.
- `firestore.indexes.json` — removes the collection-group lesson index no longer required by the new query.
- `CLASSBOARD_JOIN_LESSON_LIVE_FIX_REPORT.md` — this report.

## Live board and authorization

The Firestore live service writes compact snapshots after the editor's debounce and periodically updates the session heartbeat. A student subscribes only to the session and active page for the joined classroom; a different class ID is denied unless that user has a membership there. The UI's live state is based on Firestore listener server confirmation and the session timestamp, not simply on clicking Share.

The local code is Spark-compatible and does not require Cloud Functions. No two independent authenticated browser sessions were available, so live teacher-to-student updates, student write denial against deployed rules, storage access, and end-to-end persistence were not verified against Firebase.

## Checks run

- `npm test` — passed: 7 files, 54 tests.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed. Rollup emitted dependency comment-position warnings from Zod; the bundle completed.
- `npm run lint` — unavailable: the root `package.json` has no `lint` script.
- `npm --prefix functions run lint` — passed (`node --check index.js`). No Functions source was changed or deployed.
- Firebase Emulator rules tests — not run: `@firebase/rules-unit-testing` is not installed and the local Java runtime is 17; the available Firestore emulator requires a newer Java runtime.

## Firebase and deployment status

The local `.env` check found project ID `digital-classroom-aa170`, exactly one `VITE_FIREBASE_DATABASE_URL`, and a URL-shaped value. No environment values or credentials are included here. The Firebase CLI is version 15.34.0, but `firebase use` failed with an unexpected CLI error after warning that its local update/config store was inaccessible. Consequently, deployed functions/rules and Firebase logs were not inspected from this environment.

No rule deployment is needed for this code change because the rules files were not changed. The removed lesson collection-group index is no longer used by the client. If the deployed Firestore rules differ from the inspected local `firestore.rules`, deploy the reviewed file to the confirmed project with:

```sh
firebase deploy --only firestore:rules --project digital-classroom-aa170
```

Do not deploy Functions for this flow. A real two-account classroom test remains required to verify live updates and actual deployed-rule behavior.
