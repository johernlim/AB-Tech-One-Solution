# Staff username and password accounts

Use https://ab-tech-one-solution.pages.dev/admin/ for staff accounts. The GitHub Pages admin address redirects here because the backend accepts the production Cloudflare origin.

The branded staff login uses the existing Cloudflare Worker and a D1 database. Staff register with a username, password and owner-provided invitation code. Unique usernames are enforced atomically in SQLite, ignoring letter case. New passwords require 8–128 characters, at least one number, at least one special symbol (such as !), and matching confirmation. Existing accounts can continue logging in with their saved passwords. Only invited accounts can register.

Staff accounts publish product edits through the Worker to the existing GitHub repository; staff do not need GitHub accounts. The admin page provides staff account creation and login only.

## Connect the free database

1. Cloudflare → Storage & databases → D1 SQL Database → Create database. Name it **ab-tech-staff** and use the free plan.
2. Open the database → Console. Paste and execute the contents of [staff-schema.sql](../auth-worker/staff-schema.sql). This creates the account, session and rate-limit tables.
3. Copy the database **ID** (the UUID, which is not a secret). Add the following to `auth-worker/wrangler.toml`, replacing the ID with your database ID:

```toml
[[d1_databases]]
binding = "STAFF_DB"
database_name = "ab-tech-staff"
database_id = "YOUR-DATABASE-ID"
```

4. Commit and push the configuration. Keeping the binding in Wrangler preserves it in future Git deployments. Alternatively add a Production D1 binding named `STAFF_DB` in the Worker dashboard, and also update Wrangler before the next Git deployment.

## Add Production runtime secrets

In **Workers & Pages → ab-tech-catalogue-auth → Settings → Runtime variables and secrets → Production**, add:

- `STAFF_INVITE_CODE`: a random invitation code of at least 16 characters, shared privately with authorised staff. Rotating it stops the old code from registering more accounts; existing accounts continue to work.
- `STAFF_PASSWORD_PEPPER`: at least 32 cryptographically random characters. Keep this private and backed up. Changing it invalidates existing password hashes, requiring account recovery or recreation.
- `GITHUB_CATALOGUE_TOKEN`: a GitHub fine-grained personal access token owned by `johernlim`, scoped only to **AB-Tech-One-Solution**, with **Contents: Read and write** (Metadata read is automatic). Choose an expiry and renew before it expires. Save this token as a Worker secret, never in GitHub source or browser code.

Keep the existing `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` for the owner GitHub editor. No secret values should be pasted into chat or screenshots.

The GitHub token lets this Worker commit only category JSON and new JPG/PNG/WebP uploads through fixed endpoints; it is never sent to staff browsers. Tokens with access to other repositories are unnecessary.

After setup, refresh `/admin/`, choose **Create account**, enter a unique username, a long passphrase, its confirmation and the invitation code. Then log in, edit one product, and confirm the GitHub commit and Cloudflare deployment. Setup readiness checks that settings and tables exist; the first publish verifies the GitHub token's permissions.

## Sessions, limits and account recovery

Passwords are stored as salted PBKDF2-SHA256 hashes with an HMAC pepper outside the database, using 100,000 iterations to fit the Workers runtime cap. Login protection allows 20 failed attempts per IP and 10 per username within a 15-minute window. Requests reserve a slot atomically before password verification to bound concurrent checks; successful verification releases its slots without clearing other failures. Successful repeat logins therefore do not accumulate toward a daily or 15-minute login limit. A burst of simultaneous checks can still be temporarily limited. Registration has separate attempt counters (20 per IP and 10 per username in 15 minutes), so account creation cannot consume the login allowance. Existing authenticated product editing is unaffected by these login limits. No database migration is needed; older combined counters are ignored.

The invitation is validated server-side. Browser session tokens are held only in page memory, stored hashed in D1 and expire after eight hours. Refreshing the page requires logging in again. Logout revokes the session. Changes from a stale category are rejected instead of overwriting another staff member's work.

There is no email/password reset service. The owner can revoke sessions in the D1 Console using a parameter appropriate to the account:

```sql
DELETE FROM staff_sessions WHERE user_id IN (SELECT id FROM staff_users WHERE username = 'staff_username');
```

To remove an account, revoke its sessions first, then delete the user and privately issue the current invitation code for account recreation if needed. Do not edit password hashes by hand. Only trusted staff should receive invitations.

To remove expired rate-limit rows periodically:

```sql
DELETE FROM staff_attempts WHERE expires_at < unixepoch();
```

D1 and Workers are available on free plans within their allowances. High-volume authentication or image upload usage may exceed them; verify the production password hashing and publishing flow on your account before inviting staff.

References: [D1 setup](https://developers.cloudflare.com/d1/get-started/), [Worker runtime secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [GitHub fine-grained personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## Manage categories

After logging in, choose **Add category +**, enter a name, category ID, description and icon, then choose **Add & publish**. Add products in the new category using **Add product +**. To remove a category, select it and choose **Remove category**. Confirming removes it from the shared public category list while keeping its product file. The homepage and catalogue update automatically after deployment. If another staff member updates the list first, reload the admin page and log in again before retrying.
