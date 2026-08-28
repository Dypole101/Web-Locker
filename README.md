# File Locker

A single-page, password-protected file locker. Create an owner account,
approve or reject new account requests, and store/download files privately
per account — all running client-side, no backend required.

## Deploy with GitHub Pages

1. Create a new GitHub repo (public or private).
2. Add `index.html` (this file) to the repo root and push it.
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment," set **Source** to `Deploy from a branch`,
   pick your default branch (e.g. `main`) and folder `/ (root)`, then save.
5. GitHub will give you a URL like `https://<your-username>.github.io/<repo-name>/`.
   Open that — that's your locker.

Because everyone opens the same URL, storage now works consistently across
visits (previously, opening a raw file locally only worked reliably from
the exact same browser/location each time).

## How it works

- **First visit**: whoever opens the site first creates the "Owner"
  account. It's approved automatically.
- **New accounts**: anyone else can request an account from the login
  screen. Their device opens a pre-filled email to the address set in
  `ADMIN_EMAIL` inside `index.html` (currently `anshithrahman123@gmail.com`),
  notifying the owner of the request.
- **Approving/rejecting**: the owner logs in, opens the **Admin** panel, and
  approves or rejects pending requests there. (A static site has no server,
  so the actual approve/reject action has to happen inside the app — email
  links can't trigger real actions without a backend.)
- **Files**: each account's files are private to that account, stored in
  the browser's IndexedDB — a local database built into the browser.

## Important limitations to know

- **Storage is per-browser, not a real cloud database.** Files live in the
  visitor's own browser (IndexedDB), scoped to the site's URL. If you clear
  your browser data, or open the site in a different browser or in private/
  incognito mode, your files and accounts won't be there.
- **No real backend.** There's no server, no database, and no email-sending
  service — this is intentional, since embedding email credentials in
  client-side code would expose them to anyone who views the page source.
- **Password hashing is lightweight**, not cryptographic-grade. Fine for a
  personal/small-group locker; don't use it for anything highly sensitive.
- **File size**: IndexedDB can generally handle large files, but very large
  uploads may be slow or hit browser-specific storage quotas.

If you outgrow these limits (true cross-device sync, real user accounts,
server-side email), that requires an actual backend (e.g. a small Node/
Firebase/Supabase project) — a meaningfully bigger build than a static site.

## Customizing

- Change the notification email: edit `const ADMIN_EMAIL = '...'` near the
  top of the `<script>` block in `index.html`.
- Colors/animations: CSS variables and `@keyframes` are near the top of the
  `<style>` block.
