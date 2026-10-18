# ClassBoard Spark-Compatible Architecture Report

## Outcome

Ordinary teacher registration and profile recovery no longer depend on Cloud Functions. After Firebase Authentication succeeds, the client creates or retrieves `users/{authenticatedUid}` through a Firestore transaction. Firestore rules validate the identity, email, exact profile shape, provider, E.164 contact phone, and fixed `teacher` / `active` values. A profile's role and status cannot be changed by its owner. Teacher route and Firestore/Storage access now resolve from this rules-constrained profile rather than a teacher custom claim.

This is a source-code change only. Updated Firestore and Storage rules have **not** been deployed to the real project. Until those rules are deployed, self-service teacher profile creation will be denied by the existing production rules.

## Files changed

- `src/services/auth.ts` — replaced callable provisioning with idempotent Firestore transaction logic; validates UID/email/provider/name/phone, uses server timestamps, preserves existing role/status, handles the legacy `invitedEmail` field, and verifies the saved profile before returning.
- `src/context/AuthContext.tsx` — listens for Auth state and the caller's profile document; uses the protected profile role instead of waiting for a custom teacher claim. Admin backend authorization still uses trusted admin claims.
- `src/pages/TeacherAuthPage.tsx` — uses the direct profile service and provides Firestore-specific recovery/error guidance. Existing finite-loading handling and real retry remain intact.
- `src/pages/TeacherAuthPage.test.tsx` — updated page tests to exercise the profile service contract.
- `src/services/auth.test.ts` — tests bounded auth/profile operations, new teacher profile creation, idempotent login, disabled/admin profile preservation, and missing Google phone recovery.
- `firestore.rules` — added tightly scoped teacher self-create and self-profile update checks; teacher data access uses immutable profile role/status. Admin operations still require the admin custom claim.
- `storage.rules` — teacher ownership now uses the protected Firestore teacher profile instead of a teacher claim.
- `src/lib/backendFeatures.ts`, `src/vite-env.d.ts`, `.env.example` — added a default-off `VITE_FIREBASE_FUNCTIONS_ENABLED` availability switch for Functions-dependent UI. This flag does not grant access.
- `src/pages/JoinClassroom.tsx`, `src/pages/admin/AdminTeachers.tsx`, `src/pages/admin/AdminClassrooms.tsx`, `src/pages/teacher/WhiteboardEditor.tsx` — visibly disable operations that require unavailable trusted Functions while retaining Firestore-backed classroom and saved-board capabilities.
- `README.md` — documented Spark behavior and remaining trusted-backend dependencies.

No service-account credentials, Admin SDK operations, or passwords were added to the frontend. No production `.env` values were changed.

## Authorization model and rule changes

### Teacher profiles

`users/{uid}` self-create requires:

- `request.auth.uid == uid` and a non-null Firebase token email.
- Exact allowed fields and required types.
- The profile UID and email match the authenticated identity.
- `role == "teacher"`, `status == "active"`, and `phoneNumberVerified == false`.
- `authProvider` is `password` or `google.com` and matches the Firebase token provider.
- An E.164 phone number and bounded display name.
- Server timestamps for `createdAt` and `updatedAt`.

The create rule rejects a caller holding a non-teacher role claim (including an admin claim). Updates are restricted to a teacher's own active profile and the display name, phone number, unverified-phone marker, and update timestamp. UID, email, role, status, provider, and creation time remain fixed. Disabled or admin profiles cannot be converted by this flow. Profile deletion remains denied.

### Existing data access

- Firestore classroom, lesson, page, join-code, membership, and activity rules remain in place. Teacher access now consults the authenticated teacher's own immutable profile.
- Storage access still requires teacher ownership or active classroom membership; teacher ownership uses the Firestore profile.
- Admin access still requires the trusted `role=admin` custom claim and an active admin profile. `functions/scripts/bootstrapAdmin.cjs` remains an Admin SDK-only maintenance path.
- Realtime Database rules still require the trusted teacher custom claim. RTDB rules cannot read Firestore profiles, so client-created teacher profiles cannot safely authorize RTDB writes.

## Cloud Function dependency inventory

The Firebase project is reported to have no deployed Functions. Source definitions remain in `functions/index.js`; none are deployed or invoked for ordinary teacher registration/login after this change.

| Function | Caller / purpose | Spark disposition |
| --- | --- | --- |
| `provisionTeacherProfile` | Previously teacher email/Google auth profile setup | Removed from the frontend path; replaced by Firestore transaction + rules. Source remains unused. |
| `createTeacherAccount` | Admin creates an Auth teacher and password setup link | Requires trusted Admin SDK backend; disabled in Admin UI. Do not replace with browser Admin SDK. |
| `setTeacherStatus` | Admin activates/deactivates teacher and updates claims/revokes tokens | Requires trusted backend; disabled in Admin UI. |
| `updateTeacherProfile` | Admin edits another teacher's profile | Requires trusted backend; disabled in Admin UI. |
| `removeClassroomMember` | Admin revokes membership and clears RTDB roster | Requires trusted backend; disabled in Admin UI. |
| `joinClassroomByCode` | Validates code, throttles attempts, creates membership and RTDB roster | Not safely replaceable with direct client reads/writes; student Join is disabled with an explanation. |
| `leaveClassroom` | Leaves membership and clears RTDB roster | Requires trusted operation to update Firestore + RTDB; remains unavailable. |
| `ensureLiveClassroom` | Establishes RTDB teacher ownership | Requires trusted Admin SDK write and teacher claim; live sync is disabled on Spark. |
| `initializeLiveClassroom` trigger | Seeds RTDB owner and activity after classroom creation | Unavailable without Functions; Firestore classroom creation and saved lessons remain client/rules based. |
| `recordLessonCreation` trigger | Writes server-created activity records | Unavailable without Functions; activity writes remain denied to clients. |

Admin classroom viewing, metrics, and access open/close continue through Firestore queries/rules. Teacher classroom and lesson/page storage continue through Firestore rules. Student membership/code-join and RTDB live collaboration are not represented as working on Spark.

## Verification

- `npm test -- --reporter=dot` — passed, 38 tests in 5 files (unit/component mocks; not a live Firebase integration test).
- `npx tsc --noEmit` — passed.
- `npm run build` — passed.
- `npm --prefix functions run lint` — passed (`node --check index.js`).
- `npm run lint` — no root lint script exists.
- Rules emulator tests — not run. `firebase.json` has emulator configuration, but the installed Firebase CLI requires Java 21 and this environment has Java 17. `@firebase/rules-unit-testing` is not installed; installing it failed because `registry.npmjs.org` DNS is unavailable.
- Firebase project/function inspection — attempted with `firebase projects:list --json` and `firebase functions:list --project digital-classroom-aa170 --json`; both failed to reach/complete the Firebase API in this environment. No deployment or production writes were attempted.
- Real Authentication, Firestore profile writes, Google popup, classroom creation, Storage uploads, student membership, RTDB live sync, and admin callables — not verified against the real project.

## Remaining setup and limitations

1. Deploy the reviewed rules to the confirmed project. This does not deploy Functions or enable billing:

   ```sh
   firebase deploy --project digital-classroom-aa170 --only firestore:rules,storage
   ```

   Realtime Database rules are unchanged and do not need redeployment for the teacher profile change.

2. In Firebase Console, enable Email/Password and Google Authentication and confirm `localhost` plus production hostnames are in Authorized domains. Anonymous Auth remains needed if student joining is restored with a trusted backend.

3. Keep `VITE_FIREBASE_FUNCTIONS_ENABLED=false` on Spark. Set it to `true` only in a build where all required trusted functions are actually deployed. The flag is presentation/availability only; server rules and function authorization remain the security boundary.

4. Self-registered teachers can create Firestore classrooms, lessons, pages, and teacher-owned Storage content after rules deployment. Live whiteboard sync and student code joining remain unavailable because safely authorizing teacher RTDB writes and rate-limiting secret code resolution require trusted backend behavior or a separately designed Firestore-based architecture.

5. Admin listing/read metrics and direct rule-authorized classroom access status operations remain available to a properly provisioned admin. Managed teacher account creation, teacher status/profile changes, and member revocation require the existing trusted Functions or another trusted backend; they are visibly disabled and have not been moved into client code.

6. Install a Java 21 runtime and `@firebase/rules-unit-testing` in a network-enabled environment, then add/run emulator rule tests before relying on these rule expressions in production. Production Authentication/Firestore/Storage and rule deployment were not verified from this workspace.
