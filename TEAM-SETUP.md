# Unit Finder for the team: one-time setup

The team version has three parts:

1. **The team server.** A Google Sheet with a small script attached. It checks who may use the app, reads the project files from Drive for them, and keeps the team revisions and the usage log.
2. **The app itself.** The same website, `https://grihasales-cyber.github.io/unitfinder/`. People now sign in with Google instead of connecting Drive.
3. **The Android app (.apk).** A thin wrapper that opens the website full screen, built by GitHub.

Do steps A to C once. Each takes a few minutes.

---

## A. Create the team server (Google account that owns the project folders: griha.sales@gmail.com)

The script reads Drive as the account that sets it up, so use the account that owns the project folders.

1. Open Google Sheets and create a blank sheet. Name it **Unit Finder Admin**.
2. In the sheet, open **Extensions > Apps Script**.
3. Open **Project Settings** (the gear icon) and tick **Show "appsscript.json" manifest file in editor**.
4. Back in the **Editor**:
   - Open `appsscript.json` and replace everything with the contents of `backend/appsscript.json` from this repo.
   - Open `Code.gs` and replace everything with the contents of `backend/Code.gs`.
   - Press **Save**.
5. In the function list at the top, pick **setup** and press **Run**. Google asks for permission. Choose the account, then **Advanced > Go to project (unsafe) > Allow**. Google shows this warning because the script is yours and not reviewed by Google. The script can only read Drive, edit this one sheet, and check sign-ins.
6. Press **Deploy > New deployment**. Choose the type **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Press **Deploy**, then copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfy.../exec`.
7. Send the URL to Claude. Claude puts it into the app, so the team never has to type it.

"Anyone" only means the address can be reached. The script still refuses everyone who is not on your access list.

**When the script changes later:** paste the new `Code.gs`, then **Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy**. The URL stays the same.

## B. Let everyone sign in (Google Cloud Console, the account that owns the OAuth client)

The team only signs in to prove who they are, so the app now asks Google for just their email address.

1. Open **console.cloud.google.com > APIs & Services > OAuth consent screen** (in newer consoles: **Google Auth Platform**).
2. Under **Data access** (or **Scopes**), remove the Google Drive scope if it is listed. Keep only `openid` and `email`.
3. Under **Audience**, press **Publish app** to move it from *Testing* to *In production*. With only the email scope, Google does not need to review the app, and there is no 100-person test-user limit.

## C. Android app signing key (GitHub)

GitHub builds the .apk. To install updates over each other, every build must be signed with the same key. Claude created the key and sent it to you separately. Keep it private. Never upload it into the repository.

1. Open **github.com/grihasales-cyber/unitfinder > Settings > Secrets and variables > Actions > New repository secret**.
2. Add `ANDROID_KEYSTORE_B64`. The value is the whole text of `keystore-base64.txt`.
3. Add `ANDROID_KEYSTORE_PASSWORD`. The value is the text of `password.txt`.
4. Open **Actions > Android app > Run workflow** (branch `main`). When it finishes, the app is at:
   **https://github.com/grihasales-cyber/unitfinder/releases/latest/download/unitfinder.apk**

Share that link with the team. On Android: open the link, download, open the file, and allow "Install unknown apps" for Chrome or Files when asked.

### Address bar in the Android app

Done. `https://grihasales-cyber.github.io/.well-known/assetlinks.json` is published from the `grihasales-cyber.github.io` repository and names the signing key Claude sent you. If you ever change the signing key, update the fingerprint in that file (and in `android/assetlinks.json`).

---

## Using the Admin tab

Only admins see the **Admin** tab. vrn1994vishnu@gmail.com and the account that set up the server are always admins.

- **Team access:** type an email and press **Give access**. Use **Change** on a row to make someone an admin, pause their access, or remove them. Changes apply within about 5 minutes.
- **Team pricelist revision:** pick the project and revision at the top of the app, then press **Set ... as the team revision**. The team's app opens on it automatically. People can still choose another revision. For Neopolis, where revisions are per wing group, add one for each group. The app picks the one that covers the unit's wing.
- **Usage:** searches, downloads and shares, active people, searches per day, most searched projects and units, who searched the most, the revisions used, and recent activity. Choose 7, 30, 90 or 365 days. The raw log is also in the **Log** sheet of *Unit Finder Admin*.

A search is counted when a unit has loaded and stayed on screen for 2.5 seconds, so typing a number doesn't count every digit.
