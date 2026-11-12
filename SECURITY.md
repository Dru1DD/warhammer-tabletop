# Security Policy

## Supported versions

The project is pre-1.0 and has no formal releases yet. Security fixes are made on `main` and, once releases exist, in the latest `v0.x` release only.

## Reporting a vulnerability

**Please do not open a public issue, Pull Request or Discussion for a vulnerability.**

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (GitHub private vulnerability reporting). If that option is not shown, open a public issue that says only that you have a security report and asks for a private channel; do not put any details in it.

Please include what the issue is, where it is (file, feature or URL), the steps to reproduce it, and the impact you expect. This is a hobby project run by volunteers, so there is no guaranteed response time, but reports are read and acknowledged on a best-effort basis. Please give us reasonable time to fix a problem before you disclose it.

## What counts as a security issue

The app is a static browser application with no server of its own. Relevant areas are:

- the online multiplayer code (`src/multiplayer`): message parsing and validation, ownership checks, anything that lets one player act for the other, crash or freeze a peer, or read data it should not;
- loading untrusted data: save files, army codes and invitation links (`src/game/persistence.ts`, `src/game/army/armyCode.ts`);
- script injection (XSS) through names, codes or imported data;
- secrets or personal data committed to the repository or sent to a third party.

Not security issues (use a normal bug report): rules or balance errors, a host cheating in a game (host-authoritative multiplayer gives no anti-cheat, see [docs/multiplayer.md](docs/multiplayer.md)), or availability of the public PeerJS signalling server, which the project does not operate.

## Dependencies

Dependencies are installed from `package-lock.json` with `npm ci`. Run `npm audit` if you want to check them; reports about a vulnerable dependency are welcome as normal issues unless the vulnerability is exploitable through this app in a way that should not be public yet.
