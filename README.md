# Turf Ledger

A mobile-friendly ledger for a shared cricket/football turf group. It tracks play days, member contributions, payments, payouts to the turf owner, private member view links, and monthly summaries.

## Live app

After the GitHub Pages deployment workflow completes, open:

https://advjysinghyt-cmyk.github.io/turf-ledger/

## Access

- The owner signs in with the private owner access key.
- Members use individual private links and have view-only access.
- Keep the owner key private. Anyone who has it can make changes to the ledger.
- Do not publish access keys in this repository or share them in screenshots.

## Backend

The app uses the existing Supabase project on the Free plan. The browser app uses only the project's publishable key; privileged database operations are protected by server-side RPC functions and access-key checks.

## Deployment

Two GitHub Actions workflows are included:

- **Deploy web app to GitHub Pages** publishes the contents of `www/` after pushes to `main`.
- **Build Android APK** creates a debug APK after pushes to `main` and uploads it as the `turf-ledger-apk` workflow artifact.

To download the APK:
1. Open the repository's **Actions** tab.
2. Select a successful **Build Android APK** run.
3. Download the `turf-ledger-apk` artifact.
4. Extract the ZIP and install `app-debug.apk` on your Android device.

## Cost

This setup is intended to use GitHub's and Supabase's free tiers. Free-tier quotas and GitHub Actions usage limits apply. Do not enable paid Supabase add-ons or upgrade plans if keeping the cost at zero is essential.
