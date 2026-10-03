# AB Tech One Solution

Responsive static website for AB Tech One Solution, Taiping, Perak.

## Preview

Run `python -m http.server 8080`, then open http://localhost:8080.
No build tools or external JavaScript dependencies are required.

## Contact enquiries

The form validates required fields and opens a prepared email in the visitor's email app. The visitor must send that email. There is no backend, storage, or automatic form delivery. Phone and email links are also available directly.

## Publish

Push this repository to GitHub and configure Pages to deploy from the root of the `main` branch. All asset paths are relative and support project Pages URLs. For Netlify, publish the repository root with no build command. Custom domain/DNS setup is separate; this repository does not change the existing live domain.

## Assets

Company logo and Poppins font files were reused from the supplied reference repository. Poppins is distributed under the SIL Open Font License; see `assets/OFL.txt`.

## Product catalogue and admin

Open `catalogue.html` to choose one of ten product categories, then browse its products. The catalogue includes 12 clearly labelled examples. The admin sidebar contains the same ten categories. Open a category → Products to manage only its products; publishing saves that category. Open `admin/` to create an invited staff account or log in to the staff workspace.

Live publishing needs a one-time GitHub OAuth and Cloudflare connection. See [the setup guide](docs/ADMIN-SETUP.md) for architecture, owner setup, staff instructions and free-plan boundaries.

The branded staff login supports invitation-only username/password accounts and a product editor backed by the existing GitHub repository. Connecting accounts requires a D1 database and runtime secrets; see [staff account setup](docs/STAFF-ACCOUNTS.md). The admin page uses staff accounts only.

## Customer cart

Customers can add products from catalogue cards or product details, then use Cart in the homepage or catalogue header to change quantities, remove items and view the total. Adding products requires a customer account. Customers can register publicly with a username and password, and carts are saved per account in D1. Browsing remains public. The product selected before login or registration is automatically added after sign-in. Customer sessions last up to eight hours in the current browser tab; passwords are never stored in the browser. Prices refresh when the cart opens. Customer accounts are separate from staff accounts and have no access to staff editing. Quote-only products are excluded from the priced total; starting prices and example prices are marked as estimates. Delivery and installation are confirmed separately. This cart does not process payments or place orders.

Run `node tests/cart-browser.cjs` with the local preview running to verify cart behaviour.

## Category management

The staff workspace has Add category and Remove category controls. Categories are stored in `data/categories.json` and shared by the homepage, catalogue, contact service selector and cart. Adding a category publishes that list together with an empty product file in one GitHub commit. Removing a category hides it from public browsing and keeps its product file for recovery. Removed category IDs cannot be reused accidentally. Changes appear after Cloudflare deployment. The Worker must deploy the updated `auth-worker` code as well as the static site.

Run `node --test tests/categories.test.mjs tests/staff.test.mjs` and `node tests/categories-browser.cjs` to verify category publishing and page updates.

## Customer accounts

Customer routes are handled by `auth-worker/customer.mjs`. The Worker creates separate `customer_users` and `customer_sessions` tables using additive, idempotent statements on the existing D1 binding. Existing staff tables and data remain intact. Password hashing uses the existing runtime pepper with a customer-specific prefix. Cart writes require a valid customer session and use a version check to prevent overwriting newer edits. No new secret is required. Customer signup has no staff invitation code and does not grant staff permissions.

Run `node --test tests/customer.test.mjs` and `node tests/customer-browser.cjs` to verify authentication, private carts and the pending-product flow.
