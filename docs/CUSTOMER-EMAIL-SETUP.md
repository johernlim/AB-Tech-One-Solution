# Customer Gmail accounts and password reset email

Customer accounts and profile fields remain in the existing Cloudflare D1 database. Staff accounts remain separate. The public account form supports Gmail login, registration and password reset; the legacy username linking option has been removed.

The login, registration and reset forms share Gmail format validation. Domain typos such as `gmial.com` are rejected with a spelling suggestion; the address is never silently changed. This validates spelling and format, not ownership of a real Gmail mailbox. Gmail dot aliases share one customer account.

## Enable Cloudflare reset email delivery

The reset email flow is implemented, but delivery is disabled until a sender is configured. Without that connection, requests show **Password reset email is not connected yet** and do not claim an email was sent.

1. Add a domain you own to Cloudflare DNS. The website can continue using its current `pages.dev` URL, but `pages.dev` cannot be your email sender domain.
2. In Cloudflare, open **Compute → Email Service → Email Sending → Onboard Domain**. Complete the required sender DNS verification and ensure sending to customer addresses is enabled for the account.
3. Add this binding to `auth-worker/wrangler.toml` after onboarding:

   ```toml
   [[send_email]]
   name = "RESET_EMAIL"
   ```

4. Add `RESET_EMAIL_FROM = "noreply@your-domain.com"` under `[vars]` using your verified domain. Commit the configuration and deploy the Worker.
5. Check `/customer/status` from the website origin: `resetEmailConfigured` should be `true`. Then test delivery with an account whose inbox you control.

See [Cloudflare's sending setup](https://developers.cloudflare.com/email-service/get-started/send-emails/) and [Workers email binding API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/).

## Reset behavior

The Worker checks the registered Gmail in D1 before sending. Its response is the same for registered and unregistered addresses. Reset requests are rate limited. Links expire after 30 minutes, can be used once, and are stored as hashes in D1. A successful reset invalidates all sessions and other reset links for the account. The reset page removes the token from the browser address bar and uses a no-referrer policy.

Firebase Authentication is an alternative if no sender domain is available. The integration is prepared but inactive until the Firebase project configuration is supplied. See [Firebase setup](FIREBASE-AUTH-SETUP.md). It requires Email/Password authentication and migration of password authentication to Firebase; Firebase cannot reset passwords stored only in D1.
