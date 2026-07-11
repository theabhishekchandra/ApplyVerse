# Security Policy

## Reporting a vulnerability

**Please do not report security issues in public GitHub issues.**

ApplyVerse runs in the user's browser with broad host permissions, so we take
security seriously. If you find a vulnerability (e.g. a way the extension could
leak user data, run remote code, or be abused against a website), report it
**privately** via GitHub's built-in private reporting:

1. Go to the repo's **Security** tab → **Report a vulnerability**.
2. Describe the issue, affected version, and steps to reproduce.

We aim to acknowledge reports within a few days and will credit reporters who
wish to be named once a fix is released.

## Scope / design guarantees

By design, ApplyVerse:

- stores everything **locally** (`chrome.storage.local`) and transmits user data
  to **no external server**;
- contains **no remote code** (MV3 requirement) and **no bundled third-party
  runtime dependencies**;
- **never handles credentials** (no passwords, tokens, or API keys collected);
- **never bypasses CAPTCHAs** and only reads **public, no-auth endpoints** in the
  background.

A vulnerability is anything that breaks one of these guarantees. Reports that
depend on the user installing a modified/forked build, or on already-compromised
browser/OS, are out of scope.

## Supported versions

Only the **latest released version** receives security fixes.
