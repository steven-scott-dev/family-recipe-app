# Google Calendar Sync Setup (one time, ~10 minutes)

The app's calendar sync needs a Google OAuth client ID so it can read YOUR
calendar (read-only) when you tap "Connect Google Calendar." Without this,
the calendar section shows a setup message and everything else works fine.

## Steps

1. Go to https://console.cloud.google.com/ and sign in.
2. Create a project (any name, e.g. "SupperLine") — or pick an existing one.
3. Left menu → **APIs & Services → Library** → search **Google Calendar API** → Enable.
4. Left menu → **APIs & Services → OAuth consent screen**:
   - User type: **External**, then fill the required fields (app name "SupperLine",
     your email). Save. No verification needed for personal use.
   - Under **Scopes**, add `https://www.googleapis.com/auth/calendar.readonly`.
5. Left menu → **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: "SupperLine web"
   - **Authorized JavaScript origins**: add `https://family-recipe-app-puce.vercel.app`
     (add `http://localhost:5173` too if you want to test locally)
   - No redirect URIs needed. Create.
6. Copy the **Client ID** (long string ending in `.apps.googleusercontent.com`).
7. In `App.jsx`, find this line near the top of the component:
   `const GOOGLE_CLIENT_ID = '';`
   Paste your client ID between the quotes, commit, and push. Vercel redeploys automatically.

## What it does

When you tap "Connect Google Calendar" in the app, Google asks for permission
to let SupperLine **read** your calendar. The app then scans the plan's date
range for events like restaurant reservations, dinner-out plans, guests visiting,
or busy nights — and adjusts the plan: skips dinner-out nights, scales up for
guests, keeps busy nights to quick meals. Each detected event has a toggle so
you control what affects the plan.

The access token lives only in the browser's session storage (cleared when the
tab closes). SupperLine never sees your password and can't change your calendar.
