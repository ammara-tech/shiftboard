# ShiftBoard

**The staff rota for small businesses.** A manager builds the week's shifts and publishes them to everyone's
phone. Staff see their shifts, give a shift away or ask for time off, and the hours add up for payroll.

**Live site:** https://shiftboard-zeta.vercel.app/

Built by Ammara Badat as part of my portfolio. It uses Firebase, like PaperTrail, TickList and Rememba, so it
updates live on every phone and keeps working with no signal.

## Who it's for
A café, salon, small shop or restaurant with a handful of staff, where the rota is usually a photo of a
whiteboard on a WhatsApp group. The manager is often the owner, doing it on their phone between customers.

## What it does

**For managers**
- **Build the week.** Add a shift for a person, or an **open shift** that nobody has yet. Each shift has a day,
  start and end times, an unpaid break and an optional note ("Opening"). Shifts can run past midnight.
- **Drafts, then publish.** New shifts are drafts (dashed amber edge) that only managers can see. **Publish week**
  sends the whole week to the team at once, and everyone sees "The rota for 9 – 15 Nov is out".
- **Copy last week.** One press copies last week's shifts into this week as drafts. Shifts for people who've left
  become open shifts, and pressing it twice doesn't double up.
- **Clash warnings.** The rota warns, in red, when someone is booked on two shifts at the same time, or on a day
  they have approved time off. The shift editor warns before you save.
- **Send on WhatsApp.** Sends the published week, day by day, to someone without the app.
- **Approve requests.** Approve or decline time off. Approve a shift giveaway and the shift moves to the person
  taking it.
- **Hours and pay.** Everyone's paid hours per day and per week, a pay estimate from each person's rate, and
  **Download for payroll** (a CSV file for Excel, Google Sheets or an accountant). Weeks over 45 hours are flagged.
- **The team.** Invite staff with a link (copy it or send it on WhatsApp), set what each person usually does
  ("Barista") and their pay per hour, make someone a manager, remove people (their coming shifts become open
  shifts), and delete the team for everyone.

**For staff**
- **Your next shift** at the top, with how many paid hours it is.
- **The team's rota** for the week (published shifts only), with **Only my shifts** to hide everyone else's.
- **Add my shifts to my calendar.** Downloads your coming shifts as a calendar file your phone opens.
- **Give a shift away.** Offer one of your shifts to the team. Anyone else can press **I'll take it**, then a
  manager approves.
- **Ask for time off**, from one day up to 60, with a note.
- **Your hours**, day by day. Pay rates are private to managers.

**For everyone**
- **Live.** Changes appear on everyone's phone within a moment, with a message like "Your time off was approved".
- **Works offline.** The rota is kept on the phone, and changes made offline are sent when the connection is back.
  A badge shows Live, Syncing or Offline.
- **More than one team**, for someone who works at two places.
- **Installable** ("Add to Home screen"), light and dark mode, and works on a phone and a laptop: the week is a
  table on a laptop and a day-by-day list on a phone.

## Design
A staffroom whiteboard: navy ink on white, marker blue for buttons and booked shifts, amber for drafts and open
shifts that still need someone, teal for hours and pay, and red for clashes. Each person keeps the same colour
everywhere, on the edge of their shifts and their initials. Text colours pass WCAG AA contrast in both themes.

## Tech stack
Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Firebase Authentication and Cloud Firestore,
Vitest, GitHub Actions, Vercel.

## Project structure
```
app/              Pages: the rota (/), requests (/requests), hours (/hours), the team (/team), joining (/join),
                  the app manifest, icons and the light/dark script
components/       The sign-in screen, the header with the four pages, the rota and the shift editor, toasts,
                  icons and the logo
lib/              The rota's arithmetic (rota.ts), hours and pay (hours.ts), requests (requests.ts), who can do
                  what (team.ts), reading data safely and the live messages (read.ts), invite links (invite.ts),
                  names and colours (members.ts), money (money.ts), the live store (store.ts) and every change
                  to the database (actions.ts)
tests/            Unit tests for everything in lib/ that doesn't need Firebase
firestore.rules   The security rules (paste them into Firebase)
```

## How the important parts work

**Dates and times** (`lib/rota.ts`). A shift's day is a "2026-11-09" string and its times are "08:30" strings, the
way a rota is written, so a shift means the same on every phone whatever its time zone. Weeks run Monday to
Sunday and the date sums are done in UTC, so they never slip by a day. A shift that ends earlier than it starts
ends the next morning.

**Clashes** (`clashes()` in `lib/rota.ts`). Two shifts clash when the same person is on both and their times
overlap (back to back, like 08:00–12:00 and 12:00–16:00, is fine), including a night shift running into the next
morning. A shift on a day the person has approved time off is a clash too.

**Drafts and publishing.** Every shift has a `published` flag. Managers listen to all the shifts; staff listen
only to published ones, and the security rules refuse to send a draft to anyone who isn't a manager, so a draft
can't leak even if someone changes the app's code.

**Requests** (`lib/requests.ts`). Time off and giveaways are documents with a status: waiting, approved, declined
or cancelled. Approving a giveaway changes the request and moves the shift in one batch, so they can't get out of
step.

**Hours and pay** (`lib/hours.ts`). Hours are paid time: each published shift's length minus its unpaid break.
Pay is hours × the person's rate, as a guide for payroll. It doesn't include overtime, Sunday or public holiday
rates (the Basic Conditions of Employment Act sets those), and the page says so. More than 45 hours in a week is
flagged, because 45 ordinary hours a week is the usual limit in South Africa. Money is kept in cents, so sums are
exact.

**Pay is private.** Pay rates live in their own document (`teams/{id}/private/pay`) that only managers can read,
not on the team, which everyone in the team can read.

**Live updates** (`lib/store.ts`). The app listens to your profile, your team, its shifts, its requests and (for
managers) pay. When someone else changes something, Firestore sends the new version, every screen re-draws, and
`lib/read.ts` turns the change into a message. If you become a manager, the app starts listening to drafts and pay
straight away.

**Joining and leaving.** Each team has one invite code (12 characters, so it can't be guessed). Joining adds only
yourself, as staff, and the rules check the code is real. A team always has at least one manager: the last manager
can't leave while others are still in it.

## Security rules
`firestore.rules` runs on Google's servers and checks every read and write, whatever the app sends:
- your profile: only you
- a team: only its people can see it
- the rota: only managers can add, change, publish or delete shifts; staff only ever see published shifts
- requests: you can only ask for yourself, and only give away a shift that's yours; anyone else can offer to take
  it; only managers approve or decline
- pay rates: only managers can see or change them
- joining: only yourself, as staff, with a real invite code; leaving: only yourself, and never the last manager
  while others stay
- managers can remove people, make or unmake managers (a team always keeps one), and delete the team
- invite codes can be looked up one at a time, but never listed

## Tests
`npm test` runs the unit tests in `tests/` with Vitest: weeks across months and years, shift lengths and night
shifts, clashes, copying a week, the WhatsApp message and calendar file, hours and pay (including the 45-hour
flag and the payroll CSV), requests (what managers see, shifts up for grabs, checking time off), who can leave or
stop being a manager, the live messages, reading broken data safely, invite codes, names and money.
GitHub runs them on every push (`.github/workflows/tests.yml`).

## Setup (run it yourself)
1. **Firebase:** create a project at [console.firebase.google.com](https://console.firebase.google.com).
   - Authentication → Get started → turn on **Email/Password** and **Google**.
   - Firestore Database → Create database (production mode).
   - Firestore Database → **Rules**: paste in `firestore.rules` and press **Publish**.
   - Project settings → General → Your apps → add a **Web app** to get its settings.
2. **Settings:** copy `.env.example` to `.env.local` and fill in the four values from step 1.
3. **Run it:** `npm install`, then `npm run dev`, and open http://localhost:3000.
4. **Deploy on Vercel:** import the GitHub repo, add the same four settings under
   Settings → Environment Variables, and deploy. Then, in Firebase, add the Vercel address under
   Authentication → Settings → **Authorized domains**, so Google sign-in works there.

## Environment variables
Names only; the values are in `.env.local` (never committed) and in Vercel.

| Name | What it is |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | The web app's API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | e.g. `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | The Firebase project's ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | The web app's ID |

These are public by design: they say which Firebase project to use, they don't unlock anything. What protects
the rota is `firestore.rules`.

## Known gaps
- **The security rules aren't in the automatic tests.** They'd need the Firebase emulator; they're tested by hand.
- **No push notifications.** Messages like "The rota is out" show only while the app is open; staff who aren't
  using it can be sent the week on WhatsApp.
- **Pay is an estimate**, with no overtime, Sunday or public holiday rates, and no UIF or tax. It's for payroll to
  check, not a payslip.
- **No clocking in and out.** Hours come from the rota, so a shift that ran late has to be edited by a manager.
- **No repeating shifts** beyond "Copy last week", and no availability ("I can't work Mondays") yet.
- **Invite links don't expire** on their own. A manager can press "New link" to retire the old one.
- **Someone who's removed keeps what's already on their phone** until the app notices (usually straight away);
  the rules stop them reading or changing anything new.
- **English only.**

## Use of AI
I built ShiftBoard with Claude (by Anthropic) as my AI pair programmer:

1. **I chose what to build** from ideas we discussed, decided who it's for and which features it needed, and
   judged how it should look and behave.
2. **Claude wrote the code**, starting from my TickList app's sign-in, invite links and live updates, and
   explained how it works.
3. **I set up Firebase and Vercel, added the code to my project**, ran it, tested it on my laptop and phone,
   committed it and deployed it, and reported anything that broke or looked wrong so we could fix it.
