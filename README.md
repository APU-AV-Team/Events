# AV Team Events Page

Responsive GitHub Pages-ready webpage for daily AV Team events.

## Features

- Fixed left date/time panel on desktop.
- Scrollable right events panel.
- Auto-refreshes events every 30 minutes.
- Fetches today's events using POST with a raw JSON date string, for example `"2026-05-21"`.
- Hides events that have already ended today.
- Groups events by weekday/date.
- Shows only event name, date grouping, start time, end time, location, and deployment tick.
- Displays the Nueva logo with `AV Team` above the date/time.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown in your terminal.

## Deploy to GitHub Pages

Upload these files to your repository root:

- `index.html`
- `styles.css`
- `script.js`
- `nueva-logo.png`

Then enable GitHub Pages from the repository settings.


## Ringtone alert

The page includes `boxing-bell.mp3`. When an event reaches its start time and `isDeployed` is empty/false/no, the ringtone plays once for that event. Some browsers block sound until the page has user interaction, so the page shows an **Enable ringtone** button if needed.
