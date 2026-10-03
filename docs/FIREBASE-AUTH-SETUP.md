# Firebase customer authentication

Firebase Authentication handles customer passwords, login and reset email delivery. Cloudflare D1 keeps the customer account ID, Gmail, full name, mobile number, date of birth, gender and cart. Staff authentication remains in Cloudflare. No Firestore or Firebase Realtime Database is required.

## Console setup

1. Sign in at https://console.firebase.google.com/ and create a project named **AB Tech One Solution**. Analytics is optional.
2. Open **Authentication → Get started → Sign-in method** and enable **Email/Password**. Leave email-link authentication off.
3. From the project overview, click the Web icon **`</>`**, name the app **AB Tech Website**, and register it. Firebase Hosting is not required.
4. Copy `apiKey` and `projectId` from the displayed `firebaseConfig`. These are public app configuration values. Do not provide a service-account private key.
5. In **Authentication → Settings → Authorized domains**, add `ab-tech-one-solution.pages.dev`.
6. Optionally open **Authentication → Templates → Password reset** and set the sender display name to **AB Tech One Solution**. Retain Firebase's hosted reset link unless a custom handler is intentionally implemented.
7. To match the website's registration rules, set Firebase's **Authentication → Settings → Password policy** to require 8–128 characters, a number and a non-alphanumeric character. Login accepts the credentials Firebase validates, including a password reset under its default policy, so changing provider policy cannot lock a customer out through conflicting browser length rules.

## Worker configuration

Add the actual public settings under `[vars]` in `auth-worker/wrangler.toml`:

```toml
FIREBASE_WEB_API_KEY = "the-apiKey-from-firebaseConfig"
FIREBASE_PROJECT_ID = "the-projectId-from-firebaseConfig"
```

Deploy the Worker. The production `/customer/status` endpoint, requested from the website origin, should report `firebaseAuthentication: true` and `resetEmailConfigured: true`. Do not deploy placeholder values. An API key restricted by browser HTTP referrers will not work for these server-to-server REST calls; use appropriate Identity Toolkit and Secure Token API restrictions.

The frontend continues calling the Worker. Passwords travel over HTTPS to Firebase authentication endpoints and are not written to logs. Firebase ID and refresh tokens remain encrypted in server sessions, using a key derived from the existing Worker pepper. Customer sessions keep their eight-hour maximum lifetime and refresh short-lived Firebase tokens without extending that lifetime. Every authenticated customer request checks the Firebase account and revocation timestamp, so resets or account disabling revoke access.

## Existing customers

Existing Gmail customers connect to Firebase on their first successful login using their current password. Username customers first use **Link an existing username account**. The existing D1 account ID and cart are preserved. After linking, the old local password hash is replaced with an unusable random value and is never accepted as a fallback. Old local sessions and reset links are removed.

Unmigrated accounts must log in once before Firebase can send their reset email. A customer who already forgot their old local password will need an owner-assisted recovery process before migration; do not create an unverified account link or accept an unrelated Firebase identity. This limitation is communicated in the reset response without disclosing account existence.

New customer registration saves the validated profile in D1 and creates or securely links the Firebase identity. If Firebase is unavailable during registration, the local record is retained and a subsequent successful login can complete the connection. No authenticated session is granted until Firebase succeeds.

## Verification

Run `node --test tests/customer.test.mjs` for mocked Firebase signup/login/reset, session refresh and revocation, migration, private carts and profile validation. Once configured, test a real reset using an inbox you control and confirm login with the new password preserves the cart. No test should send email to unrelated customers.

Official references: [Firebase project and Web app setup](https://firebase.google.com/docs/web/setup), [Email/Password authentication](https://firebase.google.com/docs/auth/web/password-auth), [reset email](https://firebase.google.com/docs/auth/web/manage-users#send_a_password_reset_email), and [REST API](https://firebase.google.com/docs/reference/rest/auth).
