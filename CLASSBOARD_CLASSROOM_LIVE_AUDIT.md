# ClassBoard Classroom and Live Teaching Audit

## Findings

| Operation | Path / caller | Existing authorization | Finding and change |
|---|---|---|---|
| Teacher classroom list | `classrooms` query by `teacherUid`; active teacher | Owner UID and `users/{uid}` teacher profile | Kept. Dashboard now displays a direct, actionable permission message. |
| Classroom detail | `classrooms/{classroomId}`; teacher owner or active member | Owner/member Firestore rule | Kept; a listener failure is no longer confused with “not found.” |
| Lesson list/detail | `classrooms/{classroomId}/lessons/{lessonId}` | Previous read rule checked `lesson.teacherUid` | Changed teacher authorization to the parent classroom owner. This supports existing lessons missing the denormalized `teacherUid` field. Student reads remain restricted to active members and published lessons. |
| Lesson pages | `.../lessons/{lessonId}/pages/{pageId}` | Teacher owner; member only when parent lesson is published | Kept. Page-list permission errors now stop auto-creation and show an actionable message. |
| Member list | `classrooms/{classroomId}/members` | Owner, admin, or the member reading their own document | Kept. Classroom page distinguishes a failed member query from an empty roster. |
| Student join | `joinCodes/{sha256}` then `classrooms/{id}/members/{uid}` | Previously `joinClassroomByCode` callable | Replaced for Spark with exact-document lookup and self-enrollment guarded by Firestore rules. Codes are now 16 random characters; collection enumeration remains denied. |
| Student leave | `classrooms/{id}/members/{uid}` | Previously `leaveClassroom` callable | Replaced with a narrowly allowed update by the member to mark only their own membership `left`. |
| Live session | `classrooms/{id}/live/session` | Previously `ensureLiveClassroom` callable, RTDB teacher custom claim and seeded ownership node | Moved to Firestore. Reads require classroom ownership or active membership; writes require an active owner profile and validated session fields. |
| Live page snapshot | `classrooms/{id}/livePages/{pageId}` | Previously RTDB claim/roster rules | Moved to Firestore. Owner writes are validated and limited to 850 KB; active members can read only their classroom's snapshots. Updates are debounced and occur after completed Fabric operations. |
| Durable board pages | `classrooms/{id}/lessons/{lessonId}/pages/{pageId}` | Active teacher owner writes; published members read | Kept independent from transient live state, including optimistic version checks. |
| Slide storage | `classrooms/{id}/lessons/{lessonId}/pages/{pageId}/{file}` | Active teacher upload; teacher or active member of an active classroom with a published lesson read | Student download now also checks that the classroom is active. Existing upload flow stores rendered slide images, not original PDFs. |

The classroom detail page combines multiple listeners into one banner. Therefore the prior “Missing or insufficient permissions” message did not identify which listener failed. A concrete local rules mismatch was found for lessons: teacher reads used the denormalized `teacherUid` field instead of the owning classroom record. That denied older lessons without that field. The rule now authorizes using `classrooms/{classroomId}.teacherUid`. The actual deployed document and deployed rule version could not be inspected from this environment, so this diagnosis is based on the current source/schema and must be confirmed after rules deployment.

## Spark-compatible live architecture

Realtime Database rules cannot consult Firestore user profiles or membership documents. The previous RTDB design required trusted custom claims and server-maintained rosters, which are unavailable when Cloud Functions are not deployed. RTDB rules were not loosened. The application now stores temporary live session and board snapshots in Firestore, where rules can check the existing classroom owner and member documents directly. Durable lesson/page records remain separate.

The teacher's status is based on a server-confirmed Firestore snapshot plus browser connectivity and a 20-second session heartbeat. Students subscribe only after Firestore confirms their own active membership. Teachers publish a snapshot when sharing starts and after a debounced completed board operation; page changes update the shared session. On normal route exit the teacher marks sharing off. A stale heartbeat is shown as reconnecting rather than live. No student writes are allowed to live session or snapshot documents.

Student enrollment uses a 16-character code (80 bits from the 32-character alphabet). Firestore permits `get` of a known active code hash but denies `list`; the member write must prove that the hash maps to the same active classroom. A student may leave and rejoin only their own membership. Firestore Rules cannot provide a robust per-IP or per-UID rate limit, so this direct Spark flow has no server-side join-attempt throttling. The high-entropy code limits practical guessing; use a trusted backend if hard rate limits or one-time codes are required.

## Cloud Functions and admin boundaries

Teacher live teaching and student join/leave no longer call Functions from the frontend. The old Functions exports remain in `functions/index.js`, but are not invoked by these updated core flows. Admin teacher creation, profile edits, status changes, and individual member removal still call `createTeacherAccount`, `updateTeacherProfile`, `setTeacherStatus`, and `removeClassroomMember`. These privileged operations remain unavailable unless a trusted Functions backend is deployed; no Admin SDK operation was moved into the browser. Activity triggers and join activity records are also server-dependent; client join does not fabricate activity records.

## Files changed

- `firestore.rules` — parent-classroom lesson authorization; restricted high-entropy self-join; member leave/rejoin; owner/member-scoped live state and snapshot rules; closed-class content denial.
- `storage.rules` — student slide reads require active classroom membership, an active classroom, and a published lesson.
- `src/services/live.ts` — Firestore live subscriptions, session writes, snapshots, and connection metadata; removed the core callable/RTDB dependency.
- `src/services/members.ts` — Firestore code resolution and own-member create/leave operations.
- `src/services/classrooms.ts` — stores join-code length metadata for secure Spark lookup and rotation.
- `src/pages/JoinClassroom.tsx` — Spark join flow, 16-character code input, actionable errors.
- `src/pages/StudentClassroom.tsx` — Firestore live listeners and explicit membership/content errors.
- `src/pages/teacher/WhiteboardEditor.tsx` — Firestore live session, status/heartbeat, page synchronization, and load-error handling.
- `src/pages/teacher/ClassroomDetail.tsx` — listener/action error handling and legacy lesson compatibility surfaced through rules.
- `src/pages/teacher/TeacherDashboard.tsx` — classroom permission message and classroom ID copy/open affordances after creation.
- `src/utils/joinCode.ts`, `src/utils/validation.ts` — 16-character codes and schema.
- `src/utils/joinCode.test.ts`, `src/utils/validation.test.ts`, `src/services/members.test.ts` — high-entropy code and mocked Spark enrollment coverage.
- `README.md` — updated Spark join/live architecture and limitations.
- `CLASSBOARD_CLASSROOM_LIVE_AUDIT.md` — this audit.

`database.rules.json` was not changed or weakened. RTDB is no longer used by the core live board. Its existing restrictive claim/roster rules remain for any legacy/server-managed data.

## Verification

- `npm test -- --reporter=dot` — **48 tests passed** across 6 files.
- `npx tsc --noEmit` — **passed**.
- `npm run build` — **passed**. Vite emitted dependency annotation warnings from Zod but completed the production build.
- Root `npm run lint` — **not available** in `package.json`.
- `npm --prefix functions run lint` — **passed** (`node --check functions/index.js`).
- Emulator rules tests — **not run**. `@firebase/rules-unit-testing` is not installed, and Firebase CLI refuses to start the emulator with Java 17 (it requires Java 21).
- Firebase deployment/project inspection — **not verified**. The local Firebase CLI returned an unexpected error after reporting a configuration-store permission warning. No rules, Functions, or production data were deployed or modified remotely.
- Teacher/student two-browser live session, live rules authorization, file upload/download, and actual Firebase reads/writes — **not verified**. They require deployed reviewed rules, working Firebase CLI/emulator or project access, and separate authenticated sessions.

## Remaining setup and blockers

1. Install JDK 21 and `@firebase/rules-unit-testing`, then add/run emulator tests for owner writes, active-member reads, student write denial, invalid/rotated join codes, and cross-class denial.
2. Resolve Firebase CLI's local configuration-store access issue, select `digital-classroom-aa170`, review the rules, and deploy only reviewed rules/indexes:

   ```sh
   firebase deploy --project digital-classroom-aa170 --only firestore:rules,firestore:indexes,database,storage
   ```

3. Rotate existing six-character classroom codes from each classroom page; they do not meet the new Spark join schema. Newly created or rotated codes use 16 characters.
4. Confirm Anonymous Authentication is enabled for student join and Firestore/Storage are active in the Firebase Console.
5. Run two independent authenticated sessions after deployment to verify live synchronization, read-only student access, offline/reconnect behavior, and PDF/slide access.
6. Admin account creation/status/profile management and admin member removal remain blocked until a trusted Functions backend can be deployed. Do not enable billing or deploy Functions as part of this change.
