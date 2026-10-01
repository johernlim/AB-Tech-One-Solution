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

Open `catalogue.html` to choose one of ten product categories, then browse its products. The catalogue includes 12 clearly labelled examples. The admin sidebar contains the same ten categories. Open a category → Products to manage only its products; publishing saves that category. Open `admin/` for the staff workspace, or `admin/?demo=1` to try the Decap editor without changing the live website.

Live publishing needs a one-time GitHub OAuth and Cloudflare connection. See [the setup guide](docs/ADMIN-SETUP.md) for architecture, owner setup, staff instructions and free-plan boundaries.

The branded staff login supports invitation-only username/password accounts and a product editor backed by the existing GitHub repository. Connecting accounts requires a D1 database and runtime secrets; see [staff account setup](docs/STAFF-ACCOUNTS.md). The original GitHub owner editor remains available during setup.
