# Product catalogue and staff admin

The customer catalogue and admin demo work immediately on the existing GitHub Pages site. Real publishing requires the one-time login connection below. No credentials have been committed, and the live login button stays disabled until configured.

## Architecture

- Existing static HTML/CSS/JavaScript website: category filters, search, sorting and product details.
- `data/products.json`: product information, maintained through a Decap CMS list editor.
- `assets/uploads`: employee-uploaded photos. Example illustrations are in `assets/products`.
- `/admin/`: staff entry page; `/admin/?demo=1` runs the same editor against an in-memory test repository.
- GitHub: product storage, authorisation and change history.
- Cloudflare Pages: production static hosting; no database or build command needed.
- Cloudflare Worker: GitHub OAuth exchange, state verification and repository access check.

The demo resets on reload. Saving in the demo does **not** update the website or GitHub. Live editing saves the complete product list as a commit; staff should coordinate edits to avoid overwriting simultaneous changes.

## One-time owner connection

1. In Cloudflare, create a **Pages** project and connect `johernlim/AB-Tech-One-Solution`. Choose no framework, leave the build command empty, and use `.` as the output directory. Use the free plan and supplied `pages.dev` address. If GitHub prompts, grant the integration access only to this repository.
2. Create a Worker named `ab-tech-catalogue-auth`. Deploy `auth-worker/worker.mjs` through the Worker editor, or from `auth-worker` with Wrangler. Record its HTTPS `workers.dev` origin.
3. In GitHub Settings → Developer settings → OAuth Apps, create an app named **AB Tech Catalogue Admin**. Homepage: your Pages website. Authorisation callback: `https://YOUR-WORKER.workers.dev/callback`.
4. In Worker settings, set `ALLOWED_ORIGIN` to the exact website origin (for example `https://ab-tech-one.pages.dev`, **without** a trailing slash). Set `GITHUB_REPO` to `johernlim/AB-Tech-One-Solution`. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` as secrets. Keep the secret out of source files and chat.
5. Edit `admin/settings.json`: set `auth_base_url` to the HTTPS Worker origin, without a trailing slash. Keep the repository and branch values. Commit and push; Cloudflare automatically deploys changes.
6. Give each authorised employee their own GitHub account and repository write access. Staff open `/admin/`, select **Open live editor**, and approve the GitHub login themselves.
7. Verify with a small product edit: save, confirm the commit appears on GitHub, wait for the successful Pages deployment, and check the catalogue in another browser. Also verify a GitHub account without write access cannot log in.

GitHub Pages can continue serving the preview during migration. The Worker accepts one exact site origin; set it to the origin where staff actually use `/admin/`. For the current preview that is `https://johernlim.github.io` (the project path is not part of an origin). GitHub Pages has restrictions on sites primarily facilitating commercial transactions; use Cloudflare for the business catalogue.

These connections require owner access to GitHub and Cloudflare. The supplied code alone cannot create those accounts, authorise integrations or install OAuth secrets.

## Staff editing

1. Open **Product catalogue → Products**.
2. Expand a product to edit it, use **Add product** for a new one, or remove an item from the list to delete it.
3. Upload a compressed image, choose a category, and enter description, price and installation details.
4. Choose a fixed price, a starting price, or **Request a quote**. Prices support cents.
5. Enable **Visible in catalogue** when ready. Leave **Example product** on until the product, image, pricing and stock information have been confirmed.
6. Save/publish the catalogue. Changes become public after the hosting deployment completes.

The public catalogue includes only items marked visible. Hidden items still exist in the public JSON and Git history: this is a visibility toggle, **not private storage**. Do not enter customer information, confidential supplier prices or credentials.

To recover an accidental deletion, revert the product commit in GitHub and redeploy. Removing a photo from a product does not erase the file from Git history. Keep uploads small (ideally below 500 KB); repeated large uploads accumulate repository history.

## Examples and launch

All 12 seeded items are explicitly fictional examples, with original SVG product illustrations and illustrative RM prices. They are not verified brands, stock or sales offers. Replace or remove these items before promoting the catalogue as an actual inventory.

No WhatsApp destination was assumed. Enquiries currently use the existing email address and phone number. Product emails include the selected product name and category.

## Free-plan boundaries

No monthly hosting/CMS subscription is required within the selected free allowances. Cloudflare Pages currently includes 500 builds/month; each published commit can trigger a deployment. Use a free Pages/Workers address if you want zero domain registration cost. Provider limits can change; free service is not an unlimited or permanent guarantee.

The OAuth app requests GitHub `public_repo` access because the repository is public. GitHub OAuth scopes are broader than just product editing, and repository collaborators can edit website code too. Use trusted staff accounts; this setup does not provide fine-grained employee roles. A private repository would need a different scope and a separate review of access requirements.

Keep the Worker on its free plan. The login service is only used by staff, not by every catalogue visitor. Do not embed a GitHub access token or OAuth client secret in static files. This Worker sends the login token only to the configured origin and never logs it.

## Local checks

Run `python -m http.server 8080` from the repository, then visit `http://localhost:8080/catalogue.html` and `http://localhost:8080/admin/?demo=1`.

Run `node --test tests/catalogue.test.mjs tests/auth-worker.test.mjs` for product integrity and authentication boundary checks.

The full live OAuth flow must be verified after the owner has connected the services. It cannot be proven by the demo or unit tests.

References: [Decap GitHub backend](https://decapcms.org/docs/github-backend/), [Decap test backend](https://decapcms.org/docs/test-backend/), [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

For browser verification, install the optional test dependency with `npm install --no-save --package-lock=false playwright`, keep the local server running, and run `node tests/browser-check.cjs` and `node tests/admin-check.cjs`. These use your existing Chrome installation. Screenshots are saved to the ignored `.preview` folder.
