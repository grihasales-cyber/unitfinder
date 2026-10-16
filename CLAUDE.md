# Unit Finder: hand-off note for Claude Code

Paste this as your first message, with `index.html` in the repo folder.

## What this is
A personal installable web app for Vishnu R Nair (Sobha Senior Sales Manager, Bangalore, Android phone).
- Live: https://grihasales-cyber.github.io/unitfinder/ (repo `grihasales-cyber/unitfinder`, GitHub Pages from `main`, root)
- The whole app is ONE file: `index.html` (~3.4 MB: jsPDF + DejaVu fonts, pdf-lib, pdf.js, SheetJS are embedded).
- Input: `[Project] - [Unit]` plus a pricelist revision he picks. Data comes ONLY from his Google Drive (Google Identity Services token client, scope drive.readonly, OAuth client ID is in the file). No web search or outside data.
- Outputs: `[Project] - [Unit] - Costsheet.pdf`, `- Floorplan.pdf`, `- Payment Annexure.pdf`. The cost sheet replicates the official Sobha layout. The pricelist is the primary source on any conflict.

## Tabs
Cost sheet, Floor plan, Annexure, Payments.

## Payments tab (latest feature)
- Banner: "Book your home today with just X" = 6% of total value (editable %; the date is always today).
- Today: only the booking is payable.
- Next 30 days (by today + 30): rest of the pricelist's "within 30 days" payment after booking, plus annexure stages that are Completed or demanded, plus stages whose month-end is within 30 days.
- Annexure stage dates are read from the annexure PDF text (pdf.js). A date like Sep-26 means the last day of that month.
- Stage handling: "Completed" counts as demanded. A passed date shows a tick box ("Already demanded"), saved per unit in localStorage. "Date of issuance" means on demand.
- Stages are matched to pricelist milestones by words (the shorter name's words must all appear in the other), so "Ground Floor" and "Sixth Floor" never get mixed up.
- All numbers use Indian grouping (1,00,000) everywhere (`fmt`, `fmt2` -> `inGroup`).

## Team version (backend/, android/, TEAM-SETUP.md)
- Team mode is ON: `TEAM_API` in index.html is the live Apps Script `/exec` URL (deployed from griha.sales@gmail.com, sheet "Unit Finder Admin"). Opening the app with `?personal=1` falls back to personal mode (direct Drive with drive.readonly).
- In team mode people sign in with "Sign in with Google" (`google.accounts.id`, FedCM button + prompt with auto_select): Chrome shows the phone's own account picker; the ID token (JWT) is sent as `tok` and Code.gs checks it with tokeninfo?id_token= (aud, iss, exp). Token kept in localStorage `teamAuth` (~1 h); returning users are signed back in quietly via prompt(). Pop-ups failed inside the Android app, and the page redirect (kept as the "Trouble signing in?" fallback, needs redirect URI https://grihasales-cyber.github.io/unitfinder/) showed no accounts on phones where Chrome is not signed in. Every Drive call goes through `teamCall('drive', {path})` to `backend/Code.gs`, which runs as the folder owner (griha.sales@gmail.com), verifies the token's aud = our client ID, checks the email against the Users sheet, and only allows read-only paths inside the ROOTS folders.
- Sheet "Unit Finder Admin": Users (email, role, active), Log (signin/search/download/share/copy).
- Admins: SUPER_ADMINS in Code.gs (vrn1994vishnu@gmail.com) + the deploying account, plus anyone given the admin role. Admin tab: access list and usage stats.
- Team revision presets were removed at his request: everyone sees all revisions. The Presets sheet and presetAdd/presetDel in Code.gs are unused. Sign out link revokes the token and clears state.
- Android: Trusted Web Activity in android/ (launcher `ChromeFirstLauncherActivity` opens it in Chrome when installed, because Samsung Internet, the default on Samsung phones, refuses file shares with NotAllowedError), built by .github/workflows/android.yml, released as `unitfinder.apk` (tag `app`) when the signing secrets are set. Signing key is NOT in the repo (public repo). assetlinks.json is published from the `grihasales-cyber/grihasales-cyber.github.io` repo (site root redirects to /unitfinder/).

## Projects and Drive root folder IDs
Neopolis (legacy path) 18frM9pjqJZJ9Y7G3IaaVMnlfHS_IWhdZ
One World 1GeY7LEQpEuky-nuVoEh29AoL1m0E550h
Magnus 16sjHJZDKHQRAfaw8GdV9NN8JtnIzztKe
Altair 1raOogyF78HsCoCHh1T2ocl0X7Hev5isd
Ayana 1qxmAz-sk6V6cKo-MfRh-6cv8o2amUbcj
Townpark 1qypdeWMsb787yGWzGzFZSXJ4yAOcb4tb
Infinia 1p5-N8lIVTmfvtMf9NckFTzp5sXo5tj3e
Insignia 198MbmQaOZ-f7zCU1dvD0AecXRjIAk7yJ
Galera 12yxieRtGRVjKF91CyDW-K43rohEVSoey
Valley View 1YeNML6njaJkha1-W3ijjeS4MtDFsziHN
Sacred Grove 1HHD0Kzth8aSEGwhZRthLPaAuxyGsTAFf
Boulevard 15YGrB-hScN5BXgSEMkrEpQfSQHh53kCW
Birdsong 1_k27MGWp9EcBJAcLJJnaC44gRqJJOb8E (plots; pricelist is an .xlsm in "Price Sheet")
Crystal Meadows 15OMiNogda8hLCI6WdGjJJJaf_rPueD_i
Neopolis annexure folder: 1T1hTsDPP7y1LIsR4iODwQ7MzojwdnPcW (one PDF per wing, e.g. "Sobha Neopolis Phase 3 - Wing 1-1.pdf")

## How it works
- Unit number decoding (Sobha): `[Wing][Floor 2 digits][Door]`, e.g. 2132 = wing 2, floor 13, door 2. Ground floor = "GF".
- Legacy Neopolis path: `parsePricelist` + `evaluate`. Kept unchanged.
- Generic path for the other projects: a mini Excel formula evaluator runs each workbook's "Unit Pricelist" / "Plot wise Pricelist" template for the unit. The result is checked against the Master Pricelist total within Rs 1.
- Drive discovery per project root (BFS 4 levels). Files are cached in IndexedDB by id + modifiedTime. Accepts .xlsx, .xlsm (Birdsong) and .xls.
- Floor plan (all projects, all Neopolis wings): the presenter PDF is picked by wing number in its name (a file named for another project, e.g. the 560 MB Townpark "WING 2" in the Neopolis Presenter folder, is pushed down; files over 60 MB are refused). The page is found by `fpPickPage`: it scores pages for the unit's SBA + carpet (2 decimals), the plan code as a whole word (e.g. "A4", not "A14") and the unit number, and pushes down list pages (picklist, area statement: 4+ plan codes). Areas alone are not enough: in Neopolis up to 8 plans share the same areas and the picklist lists every unit. Tested against the pricelists for all 1,701 units in the 17 Neopolis presenters under 6 MB (wings 5 and 9 are 8 MB and were not tested). The old page maps for wings 4 and 10 (`PAGE_MAP`) are no longer used; they missed B2 and C2 in wing 10. Plots need a manual page number.
- Speed: the last sign-in (`teamMe`), the Neopolis revision list (`revs:neo`) and each project's file list (`disc:<id>`) are kept in localStorage and shown at once, then refreshed in the background (file lists after 2 min, kept a day). Code.gs `tree` lists a whole project folder in one request (fetchAll per level); without it (old script: "Unknown action", or "Admins only" for members) the app walks folder by folder. Presenter page texts are kept in IndexedDB (`texts:<id>:<modified>`), and once a unit is on screen its presenter is fetched and read in the background (`fpPrefetch`), so the Floor plan tab opens in well under a second. `getDriveFile` shares one download per file. Code.gs writes "Last seen" at most hourly and no longer reads Presets on sign-in.
- Team mode reads Drive files in 3 MB pieces (`teamDownload`, `range` in Code.gs); an older Code.gs without piece support sends the whole file and that still works.
- Annexure: the PDF is matched by wing and page 1 is rendered.
- Mock-Drive Playwright tests used so far: pricelist samples plus a pdf-lib-built annexure.

## Rules he wants kept
- Never use web data. Drive only. Pricelist wins on conflicts.
- Booking amount is highlighted for showing to clients.
- Ask him questions when in doubt.
- He deploys by uploading files to GitHub. With Claude Code on his machine, commit and push `index.html` directly (this replaces the old index-N.html copies).

## Known gaps / ideas
- Add vrn1994vishnu@gmail.com as an OAuth test user if Google sign-in is blocked.
- Budget search and unit comparison.
- Plot floor plans.
- Townpark needs more testing.
