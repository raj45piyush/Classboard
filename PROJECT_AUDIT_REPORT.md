# ClassBoard Project Audit

Audit date: 2026-10-17

## Summary

The repository is an existing React 19 / Vite / TypeScript application backed by Firebase Auth, Firestore, Realtime Database, Storage, and a Firebase Functions v2 source package. The teacher profile function exists in source and is called as a callable function. Its original deployed exception cannot be established from this checkout because the Firebase CLI, project alias, Functions dependencies, and Firebase Cloud Logs are unavailable here.

The confirmed profile UI issue was stale component state: `/auth/teacher` remains mounted when the `mode` query parameter changes, so pending recovery state could survive a switch. The auth page now scopes recovery state to the mode and clears it on mode changes. The profile setup card remains available after a genuine failed trusted operation, as required for recovery.

One malformed duplicate `VITE_FIREBASE_DATABASE_URL` assignment was confirmed in `.env`. The invalid duplicate was removed, preserving the valid URL. This is relevant to Realtime Database initialization; the profile callable itself uses Firebase Auth and Firestore, so this does not establish the cause of `functions/internal`.

## Requirements-to-implementation checklist

Status meanings: **Implemented in source** means the code path exists; it does not imply Firebase deployment or live integration was tested. **Partial** means a gap is described. **Not verified** means testing requires a Firebase project, emulator, browser session, or deployment access not available here.

| Area | Status | Evidence / notes |
|---|---|---|
| React routes and legacy teacher URLs | Implemented in source | `src/App.tsx`; legacy login/register URLs redirect to the unified auth page. |
| Teacher email/password and Google sign-in | Implemented in source | `src/services/auth.ts`; profile provisioning gates the dashboard. Live provider configuration not verified. |
| Teacher registration validation | Implemented in source | `src/utils/validation.ts`; validates name, email, required phone, 8+ character password, confirmation, consent before Auth creation. |
| Teacher profile provisioning | Partial | Callable source exists and verifies callable auth context, provider, existing role/status, profile fields, and writes `/users/{uid}` plus the teacher claim. Deployment and original Cloud error are unverified. |
| Profile recovery state | Implemented in source | `src/pages/TeacherAuthPage.tsx`; card requires an authenticated recovery user, failed phase, and matching auth mode. Retry reissues the callable. |
| Password reset | Implemented in source | Firebase `sendPasswordResetEmail`; neutral handling for absent accounts. Live email delivery not verified. |
| Protected teacher/admin routes | Implemented in source | `ProtectedRoute` uses the role derived from token claims and now requires active profile status. |
| Admin provisioning and teacher management | Implemented in source | Trusted bootstrap script and admin-only callables exist. Functions deployment and production authorization not verified. |
| Classroom creation/sharing | Implemented in source | Firestore auto IDs; join code generation and hash; joins use `joinClassroomByCode` callable. Emulator/live flow not tested. |
| Student classroom access | Implemented in source | Anonymous join, membership document checks, published lesson reads, read-only board UI. Separate-session behavior not tested. |
| Firestore security | Implemented in source | User role/profile writes are denied to clients; owner/member/admin access is scoped in `firestore.rules`. Rules emulator tests are absent. |
| Realtime Database security | Partial | Default deny and membership/teacher rules exist. Existing tokens may remain usable until expiry after revocation; emulator tests are absent. |
| Storage security | Implemented in source | Teacher-only image writes under 25 MB; member reads require published lesson. Emulator tests are absent. |
| Whiteboard persistence | Implemented in source | Firestore page snapshots use versioned transactions; conflict is shown as save error. Live network behavior not tested. |
| Live board synchronization | Partial | Uses debounced full Realtime Database snapshots. Teacher sharing and student content listener failures now display actionable errors. Incremental operation helpers are present but unused; live behavior is not verified. |
| PDF uploads and exports | Implemented in source | PDF.js renders to PNG pages; Storage rules permit supported image outputs; jsPDF export exists. Browser and real Storage flow not tested. |
| Tests | Partial | Utility and teacher-auth component tests exist. No Functions unit tests, rules tests, Emulator Suite integration tests, or end-to-end separate-session tests. |
| Lint | Missing root script | Root `package.json` has no lint script. Functions “lint” is only `node --check index.js`. |
| Firebase deployment | Not verified | No Firebase CLI, `.firebaserc`, or installed `functions/node_modules` in this environment. |

## Profile provisioning trace and findings

1. `TeacherAuthPage` calls `provisionTeacherProfile` after Firebase email/password or Google sign-in.
2. `src/services/auth.ts` uses `httpsCallable(functions, "provisionTeacherProfile")` with `{ displayName, phoneNumber }`.
3. `src/lib/firebase.ts` initializes the Functions client in `us-central1`.
4. `functions/index.js` exports `provisionTeacherProfile` as a Firebase Functions v2 `onCall` function in `us-central1`.
5. Callable auth context is checked (`request.auth`); the Admin SDK resolves the UID, limits provider to password/Google, refuses admin/disabled/other-role profiles, validates name and E.164 phone, writes `users/{uid}`, assigns the teacher custom claim, and returns `{ uid, role }`.
6. The client refreshes the ID token, checks the teacher claim, and reads `users/{uid}` to verify active status before navigating to `/teacher`.

The callable name, request format, project initialization pattern, Firestore collection path, and intended region match in source. Firebase callable functions verify the Firebase ID token and populate `request.auth`; no direct HTTP endpoint is used.

The original server-side error is **unknown**. The visible `functions/internal` response does not carry the original Admin SDK/Firestore exception, and deployed logs are inaccessible in this environment. The previous source did not catch/log unexpected errors at the provisioning callable boundary. It now logs unexpected Admin SDK/Firestore error code, message, and stack in Cloud Logging (without logging the request payload), maps common storage availability/permission failures to actionable callable errors, and gives a safe fallback that points to logs. A new invocation after deployment is needed to obtain the actual exception.

## Firebase configuration

- `.env` contained duplicate `VITE_FIREBASE_DATABASE_URL` entries: the first was not a valid Firebase database URL; the later valid HTTPS Firebase URL was retained. The invalid duplicate was removed.
- `.env` remains excluded by `.gitignore`; `.env.example` contains placeholders only.
- Firebase web values were not copied into this report.
- The Realtime Database URL is validated by `src/lib/firebase.ts` at startup.
- The profile callable uses Auth and Firestore, not Realtime Database. The duplicate RTDB variable therefore is not proven to be the cause of the callable failure.
- `firebase.json` configures Firestore, indexes, Realtime Database, Storage, Functions, and emulator ports. Emulator connection wiring is not implemented in the frontend.

## Backend function inventory

| Function | Access / purpose | Validation / data effects | Status |
|---|---|---|---|
| `initializeLiveClassroom` | Firestore trigger after classroom creation | Writes RTDB teacher owner and server activity record | Source exists; deployment not verified |
| `recordLessonCreation` | Firestore trigger after lesson creation | Confirms lesson owner matches classroom and writes activity | Source exists; deployment not verified |
| `ensureLiveClassroom` | Teacher claim + active profile | Checks classroom ID and ownership; writes RTDB teacher UID | Source exists; deployment not verified |
| `joinClassroomByCode` | Any authenticated user, including anonymous student | Validates code/name, throttles attempts, resolves hashed code, verifies active classroom, writes membership/activity/roster | Source exists; integration not verified |
| `provisionTeacherProfile` | Authenticated password/Google user | Validates user role/status/name/phone; writes profile and teacher claim; unexpected errors logged after deployment | Source modified; live failure remains unresolved pending logs |
| `leaveClassroom` | Authenticated member | Validates classroom ID and updates membership/roster | Source exists; integration not verified |
| `removeClassroomMember` | Email-verified active admin | Validates IDs, marks member removed, clears RTDB roster, writes activity | Source exists; integration not verified |
| `setTeacherStatus` | Email-verified active admin | Validates teacher/status, updates claim/profile, revokes refresh tokens, writes activity | Source exists; integration not verified |
| `updateTeacherProfile` | Email-verified active admin | Validates UID/name/phone; updates Auth and Firestore | Source exists; integration not verified |
| `createTeacherAccount` | Email-verified active admin | Validates details; creates Auth user, teacher claim/profile, setup link, activity | Source exists; integration not verified |

## Security findings

- Firestore `/users/{uid}` client writes are denied. The role used by app rules is a Firebase custom claim; profile role fields alone do not grant the role.
- Teacher classroom writes are bound to the authenticated teacher UID and active custom claim. Student page writes are denied.
- Join-code resolution and membership creation are performed by the Admin SDK callable; direct client membership writes and join-code reads are denied.
- Storage has a default deny rule and validates teacher ownership, MIME type, and size for uploaded rendered images.
- Realtime Database has root default-deny rules and scopes live reads to a teacher owner or authorized roster member. Deactivation cannot instantly erase already-issued ID tokens; revocation takes effect as clients refresh/expire tokens.
- `AuthContext` previously treated a missing/malformed profile status as `active`; it now normalizes all unknown status values to `disabled`, and `ProtectedRoute` permits only `active` profiles.
- No security rules have been weakened or deployed by this audit.

## Files changed in this audit

- `.env` — removed the confirmed invalid duplicate database URL line; retained the existing valid URL.
- `functions/index.js` — added unexpected profile-provisioning error logs and safe actionable callable error mapping; validates payload object and identity; region remains explicit.
- `src/lib/firebase.ts` — Functions region explicitly matches `us-central1`.
- `src/context/AuthContext.tsx` — unknown profile status fails closed.
- `src/components/layout/ProtectedRoute.tsx` — requires active status for all protected roles.
- `src/pages/TeacherAuthPage.tsx` — provides actionable guidance for internal callable failures and scopes recovery to a real failed attempt/mode.
- `src/pages/TeacherAuthPage.test.tsx` — regression coverage for initial modes, failed provisioning recovery, switching modes, invalid login, and existing email.
- `src/services/live.ts` — allows session listener errors to reach the caller.
- `src/pages/teacher/WhiteboardEditor.tsx` — reports live initialization, sharing, page selection, and snapshot errors instead of silently swallowing them.
- `src/pages/StudentClassroom.tsx` — reports live, published lesson/page, leave, and PDF export errors.
- `src/components/layout/ProtectedRoute.test.tsx` — tests unauthenticated, inactive, and active teacher access decisions.
- `PROJECT_AUDIT_REPORT.md` — this audit checklist and evidence record.

## Checks and verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `npm test -- --reporter=dot` | Passed: 29 tests across 4 files |
| `npm run build` | Passed; Vite emitted dependency annotation warnings from Zod |
| `npm run lint` | Not available; no root lint script |
| `npm --prefix functions run lint` | Passed; script only runs `node --check index.js` |
| Firebase Emulator Suite | Not run; Firebase CLI and emulator wiring unavailable |
| Live Auth/Firestore/RTDB/Storage/Functions | Not verified |
| Deployed `provisionTeacherProfile` status/logs | Not verified; no CLI/project alias/log access |

## Required manual deployment steps and blockers

1. Install Firebase CLI and authenticate: `npm install -g firebase-tools` then `firebase login`.
2. Install backend packages: `npm --prefix functions install`.
3. Deploy to the project configured in local `.env` (confirm its ID in Firebase Console): `firebase deploy --project <PROJECT_ID> --only functions:provisionTeacherProfile`.
4. If the CLI requests the `FIREBASE_DATABASE_URL` function parameter, enter the actual Realtime Database URL shown in Firebase Console. Functions deployment may require billing/API activation.
5. Inspect Firebase Console → Functions → `provisionTeacherProfile` → Logs after a retry. The original error can only be reported after these deployed logs are available.
6. Deploy rules and indexes separately only after reviewing the target project: `firebase deploy --project <PROJECT_ID> --only firestore:rules,firestore:indexes,database,storage`.

### Highest-priority remaining blockers

1. **High:** Deploy the updated callable and inspect its Cloud logs; the original production exception and successful live profile provisioning remain unverified.
2. **High:** Run Emulator Suite rules and callable integration tests; current automated tests mock Firebase.
3. **Medium:** Add Firebase Rules and callable integration tests using the Emulator Suite.
4. **Medium:** Add a root lint configuration/script and backend automated tests.
5. **Medium:** Verify Auth providers, authorized domains, Firestore, RTDB, Storage, and Google sign-in in Firebase Console with non-production test users.
