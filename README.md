# ClassBoard

Digital Classroom is a React 19, TypeScript, and Vite application for teacher managed classrooms, lessons, a collaborative whiteboard, and anonymous student viewing.

## Requirements and install

- Node.js 22 or later and npm
- A Firebase project with the web app registered
- Firebase CLI for deploying database rules

```sh
npm ci
cp .env.example .env
```

Fill in `.env` from Firebase Console → Project settings → General → Your apps. Never commit `.env`; Vite exposes every `VITE_` variable to the browser, so only Firebase web configuration belongs there. `.env` is gitignored.

Required variables are `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, and `VITE_FIREBASE_DATABASE_URL`. Copy the exact Realtime Database URL shown at Build → Realtime Database. The app will show an actionable configuration error if values are blank, placeholders, or the database URL is malformed.

`VITE_FIREBASE_FUNCTIONS_ENABLED` defaults to `false`. Leave it false on Spark. Set it to `true` only in a build targeting a project where the required trusted Functions have actually been deployed; this flag controls UI availability and does not grant authorization.

## Firebase project setup

1. Register a Web App and copy its configuration into `.env`.
2. In Authentication → Sign-in method, enable Email/Password, Google, and Anonymous. Anonymous sign-in is used by the classroom join flow. Configure Google OAuth consent and support email before enabling Google. Phone/SMS authentication is not used by teacher login or registration.
3. Create Firestore in production mode, create a Realtime Database instance, and enable Cloud Storage.
4. In Authentication → Settings → Authorized domains, include `localhost` for local development and every production hostname. Enable Google in Authentication → Sign-in method and configure the project support email. Firebase manages the Google OAuth client configuration.
5. Install Firebase CLI (`npm install -g firebase-tools`) and sign in (`firebase login`). Always pass the intended project explicitly when deploying.
6. Deploy rules and indexes: `firebase deploy --project YOUR_PROJECT_ID --only firestore:rules,firestore:indexes,database,storage`.
7. Cloud Functions are optional for the Spark-compatible teacher registration flow. The remaining trusted callables and Firestore triggers require Cloud Functions deployment, which may require the Blaze plan. Do not enable billing just to register teachers. Install Functions dependencies and configure `functions/.env.YOUR_PROJECT_ID` only if you later choose a plan and deployment setup that supports them.

Realtime Database URL must match the instance created in the console. The current Spark classroom flow does not use Realtime Database for authorization or live board data: live session state and board snapshots use Firestore listeners, where rules can check the classroom owner and member documents directly. Realtime Database rules remain restrictive and deny client writes to ownership and roster paths.

## First administrator provisioning

There is no public admin registration and no default administrator credential. First create an Auth user through Firebase Console → Authentication → Users → Add user, then verify that user's email. Choose an account you control; do not share its password. The provisioning script only assigns privileges to an existing, email-verified Auth user and never creates or resets a password.

The administrator password previously shared in chat should be treated as exposed. Reset it through Firebase Authentication before relying on that account; this project does not store or repeat that password.

On your Mac, authenticate the Admin SDK using Google Application Default Credentials (no private key file is needed):

```sh
gcloud auth application-default login
node functions/scripts/bootstrapAdmin.cjs --project YOUR_FIREBASE_PROJECT_ID --confirm-project YOUR_FIREBASE_PROJECT_ID --email princerajprinceraj609@gmail.com
```

You can add `--uid EXPECTED_AUTH_UID` as an extra target check. The script checks the requested project when initializing the Admin SDK, looks up the existing Auth account by email, refuses an unverified email, preserves unrelated custom claims, and safely merges the profile. It prints only the selected identity/project; it never prints Firebase configuration or credentials. Sign out, then sign in at `/login/admin` so the browser receives the new role claim. The Firebase principal used by ADC needs permission to administer Authentication users and write Firestore documents (for example, appropriately scoped Firebase Authentication Admin and Cloud Datastore permissions). Do not put service account keys in this repository or in any `VITE_` variable.

## Teacher accounts

Teachers use the unified `/auth/teacher` page to sign in or create an account. Registration requires a full name, email, phone number, password, and consent. Firebase creates the email/password identity without requiring an email verification link. The signed-in client creates `users/{uid}` in a Firestore transaction. `firestore.rules` permits only the authenticated UID to create a fixed-shape, active teacher profile whose email matches the Firebase token; the role and status cannot be changed afterward. Phone numbers are normalized to E.164 and stored with `phoneNumberVerified: false`; no SMS is sent. The client never stores passwords. Login supports email/password and Google. Legacy `/login/teacher` and `/register/teacher` URLs redirect to the matching mode. Password reset is available at `/forgot-password`; Google-only users should use Google account recovery.

Google sign-in uses Firebase popup authentication. Existing Google identities continue as the same Firebase UID, avoiding duplicate profiles. If the Google identity has no phone number and the profile does not already contain one, the user is prompted to supply a phone number. This value is contact information only and is not verified.

The existing Admin → Teachers account creation, profile edits, activation changes, and member-removal actions still use privileged callables. They are unavailable until a trusted Functions backend can be deployed; the browser does not receive Admin SDK credentials and these actions have not been replaced with unsafe client writes. Existing admin sign-in remains based on a trusted custom claim and the Admin SDK bootstrap script above.

## Development, tests, and build

```sh
npm run dev
npm test
npx tsc --noEmit
npm run build
```

The test suite includes mocked authentication/profile provisioning and validation tests, but does not exercise deployed Firebase behavior or security rules. `firebase.json` defines Auth, Firestore, Realtime Database, Storage, and Functions emulator ports. Rules tests require `@firebase/rules-unit-testing`, the Firestore emulator, and a Java 21 runtime. Configure the app to connect to emulators before treating them as integration tests.

## Deployment

Build the frontend with `npm run build`, then deploy `dist/` to Firebase Hosting or another static host with SPA fallback to `index.html`. Hosting configuration is not currently included in `firebase.json`. Add your production domain to Firebase Auth authorized domains and set production Vite environment variables in the build environment. Deploy reviewed security rules/indexes with the command above. Do not deploy Functions or enable billing for the Spark teacher-registration flow.

## Security status and known gaps

- Teacher route access uses the teacher's own Firestore profile, whose role and status are constrained by rules and cannot be edited by that user. Admin routes require both an active `users/{uid}` admin profile and a force-refreshed Firebase custom claim with `role: "admin"`; profile data or an email address alone never grants access. Self-registration rules cannot create an admin profile. Provision an existing verified Auth user with the trusted ADC script above, then sign out and back in if the browser token was issued before provisioning.
- Student membership can be created by the signed-in student only when the submitted SHA-256 hash resolves to an active classroom join code. Codes are 16 characters and only single-document lookup is allowed; join-code collection enumeration is denied. Existing six-character codes must be rotated from the classroom page before Spark self-join can use them. Classroom/lesson/page and Storage reads remain scoped to active membership, teacher ownership, or admin access.
- Activity log records are appended by trusted backend flows and client writes are denied.
- Teacher activation/deactivation remains an admin-only callable that updates the profile, changes the role claim, and revokes refresh tokens. It is unavailable when Functions are not deployed. Existing ID tokens may remain usable until they expire.
- Storage rules limit writes to active classroom teachers and PNG, JPEG, or WebP images under 25 MB; student reads require active membership in an active classroom with a published lesson. PDF uploads are rendered in-browser to page images; original PDFs are not uploaded.
- Emulator and real-project connectivity/rules tests must be run after installing the Firebase Rules testing package and a supported Java runtime. Deploy the updated rules before expecting client-created teacher profiles/classrooms/storage uploads to work.
- Spark limitation: Realtime Database rules cannot read Firestore profiles or membership documents and continue to require trusted claims/roster data. The core classroom join and live-board flow uses Firestore instead. Trusted activity triggers, admin teacher creation/status changes, and admin member removal still depend on Cloud Functions.
