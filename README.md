# Andrew’s Digest 🚀

A New York City dashboard for articles, events, networking, and opportunities. The site includes a snapshot from both Google Sheets so it runs as soon as you start it.

## Run locally

Install Node.js 24 and Python 3.9 or newer.

```sh
npm ci
npm run dev
```

Run `npm test` and `npm run build` to check the project. Use `npm run preview` to serve the production build locally.

## Publish as `digest`

1. Create a GitHub repository named **digest** and push the project to its `main` branch. Keep raw workbooks, backups, and private profiles out of the repository.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. In **Actions**, run **Synchronize digest feeds**. The workflow updates the published feed and calls the Pages deployment workflow.
4. Open the deployment URL shown in Actions. With the default GitHub Pages domain, it will be `https://YOUR-USERNAME.github.io/digest/`.

The importer is scheduled for 7:15 AM, 1:15 PM, and 7:15 PM New York time. The workflow needs write access to `main` to commit validated feed snapshots. [GitHub Actions schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## Google Sheets

- [News Digest](https://docs.google.com/spreadsheets/d/1DxssqawmGzlWn0Q_Esfxf18It_nnKX3goWzFAu0JSoM/edit) supplies the dated news and Top Articles tabs. Add the light and dark logo URLs to **Logo (light)** and **Logo (dark)** for each outlet. The app reuses those URLs on Top Articles. If there is only a light logo, dark mode displays it on a light background. With neither logo, the app displays the outlet name.
- [NYC Events & Opportunities](https://docs.google.com/spreadsheets/d/1n4-FtIN2L_ZuhNPvE7bDrp68uR-0nL1YnnK1gPIER5o/edit) supplies dated event tabs and the **Opportunities** tab. Networking uses the event category from the sheet. Opportunities are grouped by deadline, and rolling deadlines get their own section.

Run `npm run sync` to refresh from both sheets. To use downloaded workbooks, run `npm run sync -- "/path/to/News Digest.xlsx" "/path/to/NYC Events & Opportunities.xlsx"`. The importer includes the sheet’s estimated travel times. Set your starting address in Settings to generate Google Maps transit routes. The starting address stays in your browser and is passed to Maps when you click a route. GitHub Pages serves the resulting feed publicly.

## Saved records and phone-to-computer sync

The current site stores saves, reading progress, and activity in IndexedDB. Saved items and unfinished articles keep a local copy even after they leave the feed. In **Settings**, use **Export Backup** and **Import Backup** to move records to another browser or to the eventual GitHub Pages URL. Import merges by item ID, using the backup's value for matching records.

For automatic sync after publishing, use **Supabase Auth and Postgres** alongside GitHub Pages. Sign in to the same account on both devices, and enable row-level security so the signed-in owner can access their own records. Keep the public feed on Pages and use an authenticated database for personal state. [Supabase Auth](https://supabase.com/docs/guides/auth) · [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

Implement sync with one database record per user, item ID, and state type (save, reading progress, or activity). Store removal markers for unsaves and undone activity. Queue offline edits in IndexedDB, apply them when the session reconnects, and use server revisions to resolve competing edits to the same record. Offer a one-time import of existing browser records at sign-in. The production build can use a Supabase publishable key. Keep the service role key and private CV profiles out of the build. Automatic sync requires a Supabase project and app sign-in integration.
