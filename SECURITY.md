# Security

## Your session

`session.json` holds your Threads login cookies. Anyone who has it is logged in as you. Keep it out of git (it's in `.gitignore`), out of issues and out of screenshots. If it leaks, log out of all sessions in the Threads app (Settings → Account → Security) to invalidate it.

Your password is used once, encrypted with Meta's public key exactly like the threads.com login form, and is never written to disk.

## Reporting a vulnerability

If you find a security problem in this library (for example something that could leak a user's session), please don't open a public issue. Use GitHub's **Report a vulnerability** button under this repository's **Security** tab instead.

This project does not accept reports about Meta's own services. Report those to [Meta's bug bounty program](https://bugbounty.meta.com/).
