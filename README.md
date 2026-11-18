# MoneyGrid

Track recurring subscriptions and insurance policies in one place: payments, premiums, renewals,
a combined dashboard and a calendar. See the product requirements for the full scope.

**Live site: https://moneygrid-xi.vercel.app** (Firebase Authentication and Cloud Firestore, hosted on Vercel).

**Two modes.** By default everything runs in the browser: sign-in is a **mock** and data is saved in
`localStorage`. Built with `VITE_BACKEND=firebase`, the same app uses Firebase Authentication and Cloud
Firestore. See [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) to create the Firebase project and deploy.

## Run it

```bash
npm install      # first time only
npm run dev      # then open the address it prints (usually http://localhost:5173)
```

Other scripts: `npm test` (run all tests once), `npm run test:watch`, `npm run test:emulator` (tests against
the Firebase emulators), `npm run emulators` and `npm run dev:emulator` (run the app against the emulators),
`npm run build` (type-check + production build), `npm run lint`, `npm run deploy:rules`.

In the default local mode, register any email and password (8+ characters) to get started. There,
"Continue with Google" signs in to a shared demo account and password reset shows its link on screen,
because nothing is sent. On the live site (Firebase mode) both are real: Google sign-in and a reset email.

## What is built

| Phase | Area | Status |
|---|---|---|
| 1 | Foundation, layout, routing | Done |
| 2 | Auth (mock), protected routes, profile | Done |
| 3 | Subscriptions: CRUD, billing cycles, status, payment history, search/filter | Done |
| 4 | Policies: CRUD, premiums, expiry/renewal tracking, renewal history | Done |
| 5 | Dashboard: summary cards, upcoming items, charts, recent activity | Done |
| 6 | Calendar: month/week/year, payments, premiums, expiries, module filter | Done |
| 7 | In-app notifications, calendar export (.ics) | Done |
| 8 | Analytics page, test suite, error handling, hardening, optimisation | Done (Firebase-specific testing waits for phase 9) |
| 9 | Firebase (Auth, Firestore, security rules) and deployment | Done and live at https://moneygrid-xi.vercel.app |

## Deployment

The site is deployed from this repository (`master` branch) to Vercel; every push to `master` redeploys it.

- **Build settings:** Vercel detects Vite. [vercel.json](vercel.json) sends every path to `index.html` (so refreshing
  any page works), sets security headers, and proxies `/__/auth/*` to Firebase so Google sign-in runs on the
  site's own address.
- **Environment variables** (Vercel > Settings > Environment Variables; values are in the Firebase console):
  `VITE_BACKEND=firebase`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN` (the Vercel address, without
  `https://`), `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. Changing a variable needs a redeploy.
- **Firebase:** the site's address is listed under Authentication > Settings > Authorized domains. For Google
  sign-in on that address, the Google Cloud OAuth client lists `https://<address>` as an authorized origin and
  `https://<address>/__/auth/handler` as a redirect URI.
- **Security rules** are deployed separately with `npm run deploy:rules`.
- Real settings live in `.env.local`, which is git-ignored. Never commit it.

## How the data works

- **Dates** are `YYYY-MM-DD` strings (calendar dates, no time zone). **Money** is stored as integer
  minor units (paise/cents). Currencies are never mixed or converted: totals are shown per currency.
- **Payments are never assumed.** Each active subscription/policy has one open payment. It stays
  open until you mark it paid or skipped; only then does the next cycle open. "Overdue" is derived
  from an open payment whose date has passed.
- **Billing dates** are anchored to the start date and clamped to month length, so a subscription
  starting on 31 Jan pays on 28/29 Feb and 31 Mar, and a 29 Feb yearly plan handles leap years.
- **Cancelling keeps history; deleting removes it.** Cancelled, paused and expired records do not
  count toward recurring spend. Insurance coverage is never included in spending figures.
- Each user's data is stored under their own user id, so accounts never see each other's records.

## Notifications and calendar export

- **In-app notifications** (bell in the header, `/notifications`): upcoming subscription payments,
  upcoming policy premiums, policies expiring soon, overdue payments, and "marked as paid"
  confirmations. They are worked out in the browser while the app is open (on load, when records
  change, and when the tab becomes visible again). Nothing is sent by email or push.
- **No duplicates.** Each notification has a deterministic id (for example `pay-due:<paymentId>`), so
  running the generator any number of times creates each reminder once. A reminder that stops
  applying (paid, renewed, cancelled, now overdue) is closed automatically.
- **Reminder timing.** Subscriptions and policy renewals use the reminder days set on each record.
  Premiums use one setting in Settings, since policies have a single reminder field. Notifications can
  be switched off in Settings.
- **Calendar export.** On the Calendar page, "Export (.ics)" downloads the next 12 months of expected
  payments, premiums and policy expiry dates, each with a reminder at 09:00 on the reminder day. Import it
  into Google, Apple or Outlook Calendar. It is a snapshot: re-export to refresh. Event ids are stable, so
  re-importing updates the same events instead of duplicating them.
- Limits: reminders only appear when the app is opened, since there is no server. Emailing or pushing
  reminders needs a backend, which comes with the Firebase/Supabase phase.

## Testing

`npm test` runs the whole suite (Vitest + jsdom). It has two kinds of tests:

- **Logic tests** for billing dates, payments, policies, statistics, calendar events, notifications and
  the `.ics` export. Billing dates are checked against an independent calculation for every start day of
  a leap and a non-leap year, for every billing cycle, and under several time zones including ones with
  daylight-saving changes.
- **Browser-flow tests** boot the real app and drive it like a user: sign up, add and edit records, mark
  payments, change settings, export the calendar, and so on. They also check accessibility basics on every
  page and form (names for buttons, links and fields, one main heading, tables that scroll on small
  screens) and error handling (404 page, a crashed page, a failed save, damaged stored data).

The **emulator tests** (`npm run test:emulator`) start the Firebase Auth and Firestore emulators and check:
the security rules (who can read and write what, and which documents are rejected), that the Firestore
data layer behaves exactly like the localStorage one, and that the real app, driven through its screens,
works end to end on Firebase.

What the tests do **not** cover: jsdom has no layout engine, so they check behaviour and content, not
how pages look at different screen sizes. Check the layout on a phone-width window yourself. They also run
against emulators and never touch a live Firebase project (the test setup refuses to start one).

Tests live in `src/__tests__/`; shared helpers are in `src/test/`.

## Code layout

```
src/
  components/   ui/ (shadcn), common/, layout/, dashboard/, subscriptions/, policies/, calendar/
  pages/        one folder per area
  services/     all data access; mock/ holds the localStorage implementations
  stores/       Zustand stores (auth, subscriptions, policies)
  hooks/        data-loading hooks used by pages
  schemas/      Zod form validation
  types/        record types
  utils/        pure logic: billing, dates, money, status rules, stats, calendar events
  routes/       router, route guards, sidebar navigation
  __tests__/    test suite; test/ has the helpers (app harness, step runner, jsdom setup)
```

## How the Firebase mode is built

All data access goes through one small interface (`src/services/db/`) with two implementations,
localStorage and Firestore, and the services are written once on top of it.

- **Documents** live at `users/{uid}/{collection}/{id}`. Writes that belong together (a subscription, its
  open payment and an activity entry) are committed in one batch, so they succeed or fail together.
- **No double-counting.** Recording a payment re-checks, at write time, that it is still open, so a double
  click or a second tab cannot record it twice.
- **Security rules** (`firestore.rules`): each user reaches only their own data; every document is validated
  (exact fields, types, allowed values, sizes); ownership fields cannot be changed; paid and skipped payments
  cannot be rewritten; the activity log is append-only; everything else is denied. A test fails if the rules'
  allowed values drift from the app's types.
- **Sign-in** is Firebase Authentication (email/password and Google). Passwords never touch this app.

Note: the mock stores a salted SHA-256 hash of the password in the browser. It is for development only and
is not a secure substitute for Firebase Authentication.
