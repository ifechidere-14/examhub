# Exam Portal

A simple website where examiners create named exams and register students with usernames and passwords. Students can search for an exam and log in with the credentials created by the examiner.

## Setup

1. Install Node.js.
2. Create a CockroachDB database/cluster.
3. Copy `.env.example` to `.env`.
4. Put your CockroachDB connection string in `DATABASE_URL`.
5. Run:

```bash
npm install
npm run db:init
npm start
```

On Windows PowerShell, use `npm.cmd install`, `npm.cmd run db:init`, and `npm.cmd start` if `npm` is blocked by the execution policy.

Open `http://localhost:3000`.

## Windows app

The header download button serves the versioned Windows installer built with Electron. Set `EXAMHUB_APP_URL` when building if the deployed web app is not at the default Render URL, then run:

```bash
npm run electron:build
```

The installer is written to `public/downloads/ExamHub-Setup-v<version>.exe`. The installed app loads the hosted ExamHub site. You can override its destination at launch with `--app-url=https://your-examhub.example.com`.

If the Electron runtime cannot be downloaded during a build, the included Windows launcher source can still produce a working EXE with PowerShell. It opens the hosted ExamHub app in the user's default browser.

## CockroachDB Schema

The database code is in `db/schema.sql`.

## Notes

- Student passwords are stored as bcrypt hashes.
- Exam names must be unique.
- Student usernames are unique inside each exam.
