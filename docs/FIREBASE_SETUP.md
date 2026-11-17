# Firebase setup and deployment

The app runs in two modes, chosen when it is built:

| Mode | When | Sign-in | Data |
|---|---|---|---|
| **Local** (default) | `npm run dev`, the normal tests | Mock, kept in the browser | `localStorage` |
| **Firebase** | `VITE_BACKEND=firebase` | Firebase Authentication | Cloud Firestore |

Everything needed for Firebase mode is written and tested. What is left needs **your** Firebase and
Vercel accounts, so it is listed step by step below.

## 1. Try Firebase mode locally (no account needed)

The Firebase emulators run a fake Auth and Firestore on your computer, with the real security rules.

```bash
npm run emulators        # terminal 1: starts the Auth (9099) and Firestore (8080) emulators
npm run dev:emulator     # terminal 2: starts the app pointed at them
```

Sign up, add records, sign out and in. Emulator data is erased when you stop the emulators. The
emulators need Java installed (already the case on this machine).

To run the automated emulator tests (security rules, the Firestore layer, and a full run of the app
against Firebase): `npm run test:emulator`.

## 2. Create the Firebase project (about 10 minutes)

In the [Firebase console](https://console.firebase.google.com):

1. **Add project.** Name it anything. Google Analytics is optional; you can turn it off.
2. **Build > Authentication > Get started.** Under *Sign-in method* enable **Email/Password** and
   **Google** (Google asks for a support email).
3. **Build > Firestore Database > Create database.** Choose **production mode** and a location near
   your users (for India, `asia-south1` Mumbai). The location cannot be changed later.
4. **Project settings (gear icon) > General > Your apps > Web (`</>`).** Register an app. Copy the
   `firebaseConfig` values (apiKey, authDomain, projectId, appId).

## 3. Connect the app to it

```bash
copy .env.example .env.local        # Windows (use cp on Mac/Linux)
```

Fill in `.env.local` with the four values from step 2.4 (keep `VITE_BACKEND=firebase`), then
`npm run dev`. `.env.local` is git-ignored.

## 4. Publish the security rules (do this before using the app)

A new Firestore database in production mode denies everything, so the app cannot save anything until
the rules are published. They are in `firestore.rules`.

```bash
npx firebase login
npx firebase use --add          # pick your project; this creates .firebaserc
npm run deploy:rules
```

Check them first with `npm run test:emulator`. After publishing, the console's *Firestore > Rules*
tab shows the version that is live.

## 5. Deploy the website on Vercel

1. Push the project to GitHub.
2. On [vercel.com](https://vercel.com), **Add New > Project** and import the repository.
3. If the repository root contains other folders, set **Root Directory** to
   `subscription-policy-manager`. Vercel detects Vite; `vercel.json` already sets the build, the
   single-page-app redirect and basic security headers.
4. Under **Environment Variables** add, for Production (and Preview if you use it):
   `VITE_BACKEND=firebase`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
5. Deploy. Then in Firebase, **Authentication > Settings > Authorized domains > Add domain** and add
   your Vercel domain (for example `your-app.vercel.app`). **Without this, sign-in is refused.**
   Firebase does not accept wildcards, so each preview URL would need adding separately. Test on the
   production domain.

## 6. After deploying: check these by hand

- [ ] Register with email and password, and sign in again.
- [ ] "Continue with Google" works (allow pop-ups if asked).
- [ ] Add a subscription and a policy; reload the page; they are still there.
- [ ] Mark a payment paid; it shows in history, the bell and the dashboard.
- [ ] Sign out; protected pages send you to login.
- [ ] Register a second account; it sees none of the first account's data.
- [ ] "Forgot password" sends an email (check spam) and the link works.
- [ ] Open the site on a phone.

## Free-plan usage (Spark)

Firestore's free daily limits are 50,000 reads, 20,000 writes and 20,000 deletes. If a limit is
reached, saving fails with a clear message until it resets the next day.

Reads are what to watch. As a rough estimate (not measured on the live service): a person with about
15 subscriptions, 40 payments, 3 policies and 20 notifications uses around 100 reads to open the app,
and each change (adding, editing, paying) re-reads the lists, roughly another 60 to 100. That is
hundreds of actions per day for a handful of users. If usage grows, the next steps are to update the
screen from what was just written instead of re-reading, and to page the payment history.
Watch usage in the console under *Usage*, and set a budget alert if you ever move to the paid plan.

## Things to know

- **No data is carried over.** Records created in local mode live in that browser only. Firebase accounts
  start empty. (An import could be added if you need it.)
- **Reminders only appear while the app is open.** There is no email or push reminder, since that
  needs a server (Cloud Functions need the paid plan). The calendar export (`.ics`) is the alternative.
- **Password-reset email** comes from Firebase (`noreply@<project>.firebaseapp.com`) and may land in spam.
  Customising the sender needs your own domain. To use the app's own reset page instead of Firebase's,
  set *Authentication > Templates > Password reset > Customize action URL* to
  `https://<your-domain>/reset-password`; the page already accepts Firebase's code.
- **Timestamps** are stored as ISO text rather than Firestore Timestamp values, so the local and Firebase
  versions behave identically. The security rules validate the format.
- **Not enabled yet:** Firebase App Check, email verification, and a Content-Security-Policy header.
  Reasonable next hardening steps. In *Authentication > Settings* also consider turning on
  *email enumeration protection*.

## Rolling back

- **Website:** Vercel keeps every deployment; promote an earlier one from the *Deployments* tab.
- **Rules:** the Firestore *Rules* tab keeps a history; redeploy an earlier `firestore.rules` from git.
