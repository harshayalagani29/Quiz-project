# EXAMORA — activity-aware digital examination platform (prototype)
Status: backend foundation only (see "What exists / what's next"). Not "cheat-proof": browser protections are deterrents.

## Setup
1. Install Node 18+. `npm install`
2. Create a free project at supabase.com. SQL Editor → run `supabase/schema.sql`.
3. Authentication → Providers: enable Email (faculty) and **Anonymous sign-ins** (students, so RLS works without student accounts).
4. Create a faculty user in Authentication → Users (non-anonymous users get role `management`).
5. `cp .env.example .env` and fill URL + anon key (Project Settings → API). Never use the service-role key in the frontend.
6. `npm run dev`; `npm run build`; deploy by importing the repo into Vercel with the same two env vars.

## Monitoring honesty
Web events: TAB_HIDDEN, WINDOW_BLUR, FULLSCREEN_EXIT, COPY/PASTE attempts, OFFLINE. Shown as "Quiz page lost focus", never as a named app.
`activity_logs.source` = `web` | `android`. `EXTERNAL_APP_DETECTED` / `APP_SWITCH` are only allowed from a real native layer.

## Future Controlled Android Examination Mode
Native Android app + lock-task (kiosk) mode on institution-managed devices (device-owner), authorized app-state monitoring, required permissions, and an institutional privacy policy. It writes to the same `activity_logs` with `source='android'`. The web app stays independent.
