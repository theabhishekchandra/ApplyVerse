#!/usr/bin/env bash
# One-time setup for automated Chrome Web Store publishing.
#
# Walks the OAuth consent flow and stores the resulting credentials as GitHub
# Actions secrets. Nothing is written to disk and nothing lands in your shell
# history — the values go straight into `gh secret set` over stdin.
#
#   Usage: ./scripts/setup-publishing.sh
#
# Prerequisites:
#   - gh, authenticated with repo scope  (gh auth status)
#   - an OAuth client of type "Desktop app" created in the Google Cloud console
#     (see docs/PUBLISHING-AUTOMATION.md)
set -euo pipefail

PORT=8910
REDIRECT="http://127.0.0.1:$PORT"
SCOPE="https://www.googleapis.com/auth/chromewebstore"

command -v gh >/dev/null || { echo "gh is not installed"; exit 1; }
command -v node >/dev/null || { echo "node is not installed"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated — run: gh auth login"; exit 1; }

echo "Chrome Web Store publishing setup"
echo
echo "Paste the credentials from the Cloud console OAuth client (Desktop app)."
echo "Make sure its authorised redirect URI includes exactly:  $REDIRECT"
echo
read -r  -p "Client ID:     " CLIENT_ID
read -rs -p "Client secret: " CLIENT_SECRET; echo
[ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ] || { echo "both values are required"; exit 1; }

AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth"
AUTH_URL+="?response_type=code"
AUTH_URL+="&client_id=$CLIENT_ID"
AUTH_URL+="&redirect_uri=$REDIRECT"
AUTH_URL+="&scope=$SCOPE"
AUTH_URL+="&access_type=offline"
AUTH_URL+="&prompt=consent"   # force a refresh_token even on re-runs

echo
echo "Opening the consent screen. Approve it in the browser."
echo "If it does not open, visit this URL manually:"
echo
echo "  $AUTH_URL"
echo

# Catch the redirect locally, exchange the code, print only the refresh token.
REFRESH_TOKEN="$(
  CLIENT_ID="$CLIENT_ID" CLIENT_SECRET="$CLIENT_SECRET" \
  REDIRECT="$REDIRECT" PORT="$PORT" AUTH_URL="$AUTH_URL" \
  node --input-type=module -e '
    import http from "node:http";
    import { exec } from "node:child_process";

    const { CLIENT_ID, CLIENT_SECRET, REDIRECT, PORT, AUTH_URL } = process.env;

    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out after 5 minutes")), 300_000);
      const server = http.createServer((req, res) => {
        const url = new URL(req.url, REDIRECT);
        const code = url.searchParams.get("code");
        const err  = url.searchParams.get("error");
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<body style="font:16px system-ui;padding:3rem">
          <h2>${code ? "Authorised ✓" : "Failed"}</h2>
          <p>${code ? "You can close this tab and return to the terminal." : err}</p>
        </body>`);
        clearTimeout(timer);
        server.close();
        code ? resolve(code) : reject(new Error(err || "no code returned"));
      });
      server.listen(Number(PORT), "127.0.0.1", () => exec(`open "${AUTH_URL}"`));
    });

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT,
      }),
    });

    const json = await res.json();
    if (!json.refresh_token) {
      console.error("token exchange failed:", JSON.stringify(json, null, 2));
      process.exit(1);
    }
    process.stdout.write(json.refresh_token);
  '
)"

echo
echo "Got a refresh token. Storing all three as GitHub Actions secrets…"
printf '%s' "$CLIENT_ID"     | gh secret set CWS_CLIENT_ID
printf '%s' "$CLIENT_SECRET" | gh secret set CWS_CLIENT_SECRET
printf '%s' "$REFRESH_TOKEN" | gh secret set CWS_REFRESH_TOKEN

echo
echo "Done. Verify with:  gh secret list"
echo "Then dry-run:       gh workflow run publish.yml -f dry_run=true"
