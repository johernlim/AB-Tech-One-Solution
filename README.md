# AB Tech One Solution

## Purchase with Purchase (PWP)

Staff can manage products in the dedicated **PWP Products** category, then open **PWP offers** to add, edit or delete offers. Select one or more visible qualifying products and one or more visible fixed-price PWP add-ons. Each add-on has its own discounted price. The active switch controls availability; date scheduling is removed. Saving publishes `data/pwp-offers.json` through the authenticated staff Worker and GitHub, with conflict protection.

Any selected qualifying product unlocks the optional add-ons in the customer cart. The per-item limit applies to each add-on separately and scales with the combined quantity of qualifying items. Additional quantities use the normal price. Removing all qualifying products, hiding a product or pausing an offer restores normal pricing. The cheapest eligible offer applies without stacking. Checkout uses the cart's discounted total and remains UI-only pending payment integration; future payment/order creation must independently verify current products and offers on the server.

The PWP category includes a 64GB microSD Card at RM35, marked New Arrival. Buying the Uniarch UHO-C1-M3F2 camera unlocks the card at RM20, with a limit of one discounted card per camera. The card uses a generic illustration. Staff can edit the product or offer through the admin workspace. Run `node --test tests/pwp.test.mjs` and `node tests/pwp-browser.cjs` (with the preview on port 8080) to test PWP.

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

Customers can add products from catalogue cards or product details, then use Cart in the homepage or catalogue header to change quantities, remove items and view the total. Adding products requires a customer account. Customers register with Gmail, password, full name, Malaysian mobile number, date of birth and gender; carts are saved per account in D1. Browsing remains public. The product selected before login or registration is automatically added after sign-in. Customer sessions last up to eight hours in the current browser tab; passwords are never stored in the browser. Prices refresh when the cart opens. Customer accounts are separate from staff accounts and have no access to staff editing. Quote-only products are excluded from the priced total; starting prices and example prices are marked as estimates. Delivery and installation are confirmed separately. This cart does not process payments or place orders.

Run `node tests/cart-browser.cjs` with the local preview running to verify cart behaviour.

## Category management

Drag a category or its dotted handle in the admin sidebar to change its position. Dropping saves and publishes the order automatically; keyboard users can focus a category and press Alt + Up / Down. The homepage and catalogue use that shared order after deployment. Failed saves restore the previous order and display an error. Deploy the updated staff Worker to enable category ordering.

Each category, including newly added categories, has **Edit category**. Staff can change its name, description and icon; **Remove category** is inside the edit dialog. Category IDs stay fixed. Renaming updates the registry, product category names and PWP offer references in one GitHub commit, while old category links and saved carts resolve through name aliases. The dedicated PWP category keeps its required name and cannot be removed, but its description and icon can be edited.

The staff workspace has Add category and Remove category controls. Categories are stored in `data/categories.json` and shared by the homepage, catalogue, contact service selector and cart. Adding a category publishes that list together with an empty product file in one GitHub commit. Removing a category hides it from public browsing and keeps its product file for recovery. Removed category IDs cannot be reused accidentally. Changes appear after Cloudflare deployment. The Worker must deploy the updated `auth-worker` code as well as the static site.

Run `node --test tests/categories.test.mjs tests/staff.test.mjs` and `node tests/categories-browser.cjs` to verify category publishing and page updates.

## Customer accounts

Customer routes are handled by `auth-worker/customer.mjs`. The Worker creates separate `customer_users` and `customer_sessions` tables using additive, idempotent statements on the existing D1 binding. Existing staff tables and data remain intact. Password hashing uses the existing runtime pepper with a customer-specific prefix. Cart writes require a valid customer session and use a version check to prevent overwriting newer edits. No new secret is required. Customer signup has no staff invitation code and does not grant staff permissions.

Run `node --test tests/customer.test.mjs` and `node tests/customer-browser.cjs` to verify authentication, private carts and the pending-product flow.

The public account form supports Gmail login, registration and password reset. The legacy username linking option is removed. For Cloudflare email sending, see [customer email setup](docs/CUSTOMER-EMAIL-SETUP.md). Profile and password-reset schema changes are additive and preserve existing data.

Firebase Authentication can handle customer passwords and reset email delivery while profiles and carts stay in D1. The integration is inactive until `FIREBASE_WEB_API_KEY` and `FIREBASE_PROJECT_ID` are configured; see [Firebase setup](docs/FIREBASE-AUTH-SETUP.md). Existing users migrate on successful login and retain their D1 account ID and cart. Linked accounts never fall back to local passwords. Staff authentication is unaffected.

Click the signed-in name to view the customer’s registration details and save a shipping address privately in D1. The address can be updated and is separate from the cart. Saving requires a nonempty address with a change beyond spacing; empty or unchanged input shows a validation message without updating the database. Birthdays use direct day, month and year menus; the Other gender option is removed. View cart in the cart window opens `cart.html` for a full-page cart with the same quantities, removal, totals and saved items.

Shipping addresses now have street, city, Malaysian state / federal territory, 5-digit postcode and country fields. Country is preset to Malaysia. Structured fields and the formatted address are saved together in D1; existing free-text addresses stay available in Street Address until the customer completes the new fields.

The full cart page includes a checkout details UI with customer name, mobile number, Gmail, optional order instructions and Malaysian shipping address fields. Account details prefill the form. The privacy-policy checkbox is omitted. This is UI-only until a payment link/provider is connected: validating the form keeps the cart and does not create an order, charge a payment or save checkout edits to the account.

## Category page first response

Cloudflare Pages Functions renders `/catalogue?category=…` and `/catalogue?view=all` from the same deployment’s published category/product JSON. Product cards, prices, current discounts and badges are included in the HTML. The browser uses the embedded public snapshot to enable search, details and cart actions without fetching catalogue data again. New categories need no manual page generation. Only the catalogue routes invoke the function; other assets remain static. Responses revalidate rather than retaining an old promotion page. The existing static client loader remains a fallback if rendering fails or the site runs on a plain local static server.

Run `node --test tests/server-catalogue.test.mjs` and `node tests/server-catalogue-browser.cjs`. The browser test checks products with JavaScript disabled and interactive behaviour with catalogue fetches blocked. Set `CATALOGUE_TEST_URL` to verify the deployed site.
