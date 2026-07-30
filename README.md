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

## CockroachDB Schema

The database code is in `db/schema.sql`.

## Notes

- Student passwords are stored as bcrypt hashes.
- Exam names must be unique.
- Student usernames are unique inside each exam.
