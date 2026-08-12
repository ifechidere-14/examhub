const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const sessionSecret = process.env.SESSION_SECRET || 'dev-session-secret';

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Add it to .env before using CockroachDB.');
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function createSessionToken(payload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', sessionSecret).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

function verifySessionToken(token) {
  if (!token) return null;

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = crypto.createHmac('sha256', sessionSecret).update(encoded).digest('hex');
  if (expected !== signature) return null;

  try {
    return JSON.parse(base64UrlDecode(encoded));
  } catch (error) {
    return null;
  }
}

function getSessionFromCookie(req, cookieName) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = cookieHeader.split(';').map((entry) => entry.trim()).filter(Boolean);
  const match = cookies.find((entry) => entry.startsWith(`${cookieName}=`));

  if (!match) return null;
  const rawValue = decodeURIComponent(match.slice(cookieName.length + 1));
  return verifySessionToken(rawValue);
}

function setSessionCookie(res, cookieName, payload) {
  const token = createSessionToken(payload);
  res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`);
}

function clearSessionCookie(res, cookieName) {
  res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function requireExaminer(req, res, next) {
  const session = getSessionFromCookie(req, 'examiner_session');
  if (!session || session.type !== 'examiner') {
    return res.status(401).json({ message: 'Examiner session required.' });
  }

  req.examiner = session;
  next();
}

function requireStudent(req, res, next) {
  const session = getSessionFromCookie(req, 'student_session');
  if (!session || session.type !== 'student') {
    return res.status(401).json({ message: 'Student session required.' });
  }

  req.student = session;
  next();
}

function connectionStringForDatabase(databaseName) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

const ssl = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=')
  ? { rejectUnauthorized: false }
  : undefined;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
    ? connectionStringForDatabase('exam_portal')
    : undefined,
  ssl
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function normalizeExamStatus(status, allowAll = false) {
  const value = String(status || 'draft').toLowerCase();
  if (allowAll && value === 'all') {
    return 'all';
  }
  return ['draft', 'published', 'closed'].includes(value) ? value : 'draft';
}

function normalizeResultStatus(status) {
  const value = String(status || 'pending').toLowerCase();
  return ['pending', 'submitted', 'graded'].includes(value) ? value : 'pending';
}

function parseOptionalTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildInviteEmailContent({ recipient, examName, appUrl }) {
  const baseUrl = appUrl || process.env.APP_URL || 'http://localhost:3000';
  return {
    subject: `You’re invited to ${examName}`,
    text: `Hello,\n\n${recipient} has been invited to join the exam \"${examName}\" on ExamHub.\nOpen ${baseUrl} to continue.\n`
  };
}

function shuffleQuestions(questions) {
  const items = [...questions];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

async function initializeDatabase() {
  const adminPool = new Pool({
    connectionString: connectionStringForDatabase('defaultdb'),
    ssl
  });

  await adminPool.query('CREATE DATABASE IF NOT EXISTS exam_portal');
  await adminPool.end();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS examiners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name STRING NOT NULL,
      username STRING NOT NULL UNIQUE,
      password_hash STRING NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      examiner_id UUID REFERENCES examiners (id) ON DELETE SET NULL,
      name STRING NOT NULL UNIQUE,
      examiner_name STRING NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status STRING NOT NULL DEFAULT 'draft',
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      passing_score INT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exam_students (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
      full_name STRING NOT NULL,
      username STRING NOT NULL,
      password_hash STRING NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (exam_id, username)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exam_questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
      question_text STRING NOT NULL,
      question_order INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_answers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES exam_students (id) ON DELETE CASCADE,
      question_id UUID NOT NULL REFERENCES exam_questions (id) ON DELETE CASCADE,
      answer_text STRING NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (student_id, question_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exam_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES exam_students (id) ON DELETE CASCADE,
      status STRING NOT NULL DEFAULT 'pending',
      score INT,
      max_score INT,
      feedback STRING,
      submitted_at TIMESTAMPTZ,
      graded_at TIMESTAMPTZ,
      UNIQUE (exam_id, student_id)
    )
  `);

  await pool.query("ALTER TABLE exams ADD COLUMN IF NOT EXISTS status STRING NOT NULL DEFAULT 'draft'");
  await pool.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS passing_score INT');
  await pool.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS randomize_questions BOOLEAN NOT NULL DEFAULT false');
  await pool.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS duration_minutes INT');
  await pool.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS room_code STRING');
  await pool.query('CREATE INDEX IF NOT EXISTS exam_students_exam_id_idx ON exam_students (exam_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS exam_questions_exam_id_idx ON exam_questions (exam_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS student_answers_student_id_idx ON student_answers (student_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS exam_results_exam_id_idx ON exam_results (exam_id)');
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Database connection failed.' });
  }
});

app.post('/api/exams', async (req, res) => {
  const {
    examName,
    examinerName,
    examinerUsername,
    examinerPassword,
    students,
    questions,
    examStatus,
    startAt,
    endAt,
    passingScore,
    randomizeQuestions,
    durationMinutes,
    roomCode
  } = req.body;

  if (!examName || !examinerName || !examinerUsername || !examinerPassword || !Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ message: 'Exam name, examiner account, and at least one student are required.' });
  }

  const cleanStudents = students
    .map((student) => ({
      fullName: String(student.fullName || '').trim(),
      username: String(student.username || '').trim(),
      password: String(student.password || '')
    }))
    .filter((student) => student.fullName && student.username && student.password);

  if (cleanStudents.length !== students.length) {
    return res.status(400).json({ message: 'Every student needs a name, username, and password.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const examinerPasswordHash = await bcrypt.hash(examinerPassword, 10);
    const examinerResult = await client.query(
      `INSERT INTO examiners (full_name, username, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET full_name = excluded.full_name, password_hash = excluded.password_hash
       RETURNING id, full_name, username`,
      [examinerName.trim(), examinerUsername.trim(), examinerPasswordHash]
    );
    const examiner = examinerResult.rows[0];

    const normalizedStatus = normalizeExamStatus(examStatus);
    const startAtValue = parseOptionalTimestamp(startAt);
    const endAtValue = parseOptionalTimestamp(endAt);
    const passingScoreValue = passingScore === '' || passingScore === null || passingScore === undefined
      ? null
      : Number(passingScore);
    const durationMinutesValue = durationMinutes === '' || durationMinutes === null || durationMinutes === undefined
      ? null
      : Number(durationMinutes);
    const roomCodeValue = String(roomCode || '').trim() || null;
    const randomizeQuestionsValue = Boolean(randomizeQuestions);

    const examResult = await client.query(
      'INSERT INTO exams (name, examiner_name, examiner_id, status, start_at, end_at, passing_score, randomize_questions, duration_minutes, room_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, name, examiner_name, created_at, status, start_at, end_at, passing_score, randomize_questions, duration_minutes, room_code',
      [examName.trim(), examinerName.trim(), examiner.id, normalizedStatus, startAtValue, endAtValue, passingScoreValue, randomizeQuestionsValue, durationMinutesValue, roomCodeValue]
    );

    const exam = examResult.rows[0];

    for (const student of cleanStudents) {
      const passwordHash = await bcrypt.hash(student.password, 10);
      await client.query(
        'INSERT INTO exam_students (exam_id, full_name, username, password_hash) VALUES ($1, $2, $3, $4)',
        [exam.id, student.fullName, student.username, passwordHash]
      );
    }

    const cleanQuestions = Array.isArray(questions)
      ? questions.map((question) => String(question.questionText || '').trim()).filter(Boolean)
      : [];

    for (const [index, questionText] of cleanQuestions.entries()) {
      await client.query(
        'INSERT INTO exam_questions (exam_id, question_text, question_order) VALUES ($1, $2, $3)',
        [exam.id, questionText, index + 1]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ exam, examiner, studentCount: cleanStudents.length, questionCount: cleanQuestions.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create exam error:', error);

    if (error.code === '23505') {
      return res.status(409).json({ message: 'That exam name or student username is already used.' });
    }

    res.status(500).json({ message: error.message || 'Could not create exam.' });
  } finally {
    client.release();
  }
});

app.post('/api/examiner-login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, full_name, username, password_hash FROM examiners WHERE username = $1',
      [username.trim()]
    );
    const examiner = result.rows[0];

    if (!examiner || !(await bcrypt.compare(password, examiner.password_hash))) {
      return res.status(401).json({ message: 'Invalid examiner username or password.' });
    }

    setSessionCookie(res, 'examiner_session', {
      type: 'examiner',
      examinerId: examiner.id,
      examinerName: examiner.full_name,
      username: examiner.username
    });

    res.json({ examinerId: examiner.id, examinerName: examiner.full_name, username: examiner.username });
  } catch (error) {
    console.error('Examiner login error:', error);
    res.status(500).json({ message: 'Could not log examiner in.' });
  }
});

app.post('/api/examiner-logout', (req, res) => {
  clearSessionCookie(res, 'examiner_session');
  res.json({ message: 'Logged out.' });
});

app.post('/api/examiner-password-reset', async (req, res) => {
  const { username, recoveryName, email, newPassword } = req.body;
  const recoveryValue = String(recoveryName || email || '').trim();

  if (!username || !recoveryValue || !newPassword) {
    return res.status(400).json({ message: 'Username, recovery name, and a new password are required.' });
  }

  try {
    const result = await pool.query('SELECT id FROM examiners WHERE username = $1 AND full_name = $2', [username.trim(), recoveryValue]);
    const examiner = result.rows[0];
    if (!examiner) {
      return res.status(404).json({ message: 'No matching examiner account found.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE examiners SET password_hash = $1 WHERE id = $2', [passwordHash, examiner.id]);
    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Examiner reset error:', error);
    res.status(500).json({ message: 'Could not reset password.' });
  }
});

app.post('/api/examiner-invite', requireExaminer, async (req, res) => {
  const { email, examId } = req.body;
  if (!email || !examId) {
    return res.status(400).json({ message: 'Email and exam are required.' });
  }

  try {
    const examResult = await pool.query('SELECT id FROM exams WHERE id = $1 AND examiner_id = $2', [examId, req.examiner.examinerId]);
    if (!examResult.rows[0]) {
      return res.status(404).json({ message: 'Exam not found.' });
    }

    const recipient = String(email).trim();
    const examNameResult = await pool.query('SELECT name FROM exams WHERE id = $1', [examId]);
    const examName = examNameResult.rows[0]?.name || 'your exam';
    const inviteEmail = buildInviteEmailContent({ recipient, examName, appUrl: process.env.APP_URL });

    await pool.query(
      'INSERT INTO exam_invites (exam_id, email, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [examId, recipient, 'sent']
    );

    res.json({ message: `Invitation sent to ${recipient}.`, preview: inviteEmail });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ message: 'Could not send invitation.' });
  }
});

app.get('/api/examiner-session', requireExaminer, (req, res) => {
  res.json({ examinerId: req.examiner.examinerId, examinerName: req.examiner.examinerName, username: req.examiner.username });
});

app.get('/api/examiners/me/exams', requireExaminer, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.name, e.created_at, e.status, e.start_at, e.end_at,
        count(DISTINCT s.id) AS student_count,
        count(DISTINCT q.id) AS question_count
       FROM exams e
       LEFT JOIN exam_students s ON s.exam_id = e.id
       LEFT JOIN exam_questions q ON q.exam_id = e.id
       WHERE e.examiner_id = $1
       GROUP BY e.id, e.name, e.created_at, e.status, e.start_at, e.end_at
       ORDER BY e.created_at DESC`,
      [req.examiner.examinerId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Examiner exams error:', error);
    res.status(500).json({ message: 'Could not load examiner exams.' });
  }
});

app.get('/api/exams/:examId/admin', requireExaminer, async (req, res) => {
  try {
    const examResult = await pool.query(
      'SELECT id, name, examiner_name, status, start_at, end_at, passing_score, randomize_questions, duration_minutes, room_code FROM exams WHERE id = $1 AND examiner_id = $2',
      [req.params.examId, req.examiner.examinerId]
    );
    const exam = examResult.rows[0];

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found for this examiner.' });
    }

    const questionsResult = await pool.query(
      'SELECT id, question_text, question_order FROM exam_questions WHERE exam_id = $1 ORDER BY question_order, created_at',
      [req.params.examId]
    );

    const answersResult = await pool.query(
      `SELECT s.full_name, s.username, q.question_text, a.answer_text, a.submitted_at
       FROM student_answers a
       JOIN exam_students s ON s.id = a.student_id
       JOIN exam_questions q ON q.id = a.question_id
       WHERE s.exam_id = $1
       ORDER BY s.full_name, q.question_order`,
      [req.params.examId]
    );

    const resultsResult = await pool.query(
      `SELECT s.id AS student_id, s.full_name, s.username, r.id AS result_id, r.status AS result_status, r.score, r.max_score, r.feedback, r.submitted_at, r.graded_at
       FROM exam_students s
       LEFT JOIN exam_results r ON r.student_id = s.id AND r.exam_id = $1
       WHERE s.exam_id = $1
       ORDER BY s.full_name, s.username`,
      [req.params.examId]
    );

    res.json({ exam, questions: questionsResult.rows, answers: answersResult.rows, results: resultsResult.rows });
  } catch (error) {
    console.error('Exam admin error:', error);
    res.status(500).json({ message: 'Could not load exam admin page.' });
  }
});

app.get('/api/exams/:examId/analytics', requireExaminer, async (req, res) => {
  try {
    const examResult = await pool.query('SELECT id FROM exams WHERE id = $1 AND examiner_id = $2', [req.params.examId, req.examiner.examinerId]);
    if (!examResult.rows[0]) {
      return res.status(404).json({ message: 'Exam not found for this examiner.' });
    }

    const analyticsResult = await pool.query(
      `SELECT e.id, e.name, COUNT(DISTINCT s.id) AS student_count,
        COUNT(DISTINCT CASE WHEN r.status IN ('submitted', 'graded') THEN s.id END) AS submitted_count,
        COUNT(DISTINCT CASE WHEN r.status = 'graded' THEN s.id END) AS graded_count,
        AVG(r.score) AS average_score,
        MAX(r.score) AS highest_score,
        MIN(r.score) AS lowest_score,
        COUNT(DISTINCT CASE WHEN r.score IS NOT NULL AND e.passing_score IS NOT NULL AND r.score >= e.passing_score THEN s.id END) AS pass_count,
        COUNT(DISTINCT CASE WHEN r.score IS NOT NULL AND e.passing_score IS NOT NULL AND r.score < e.passing_score THEN s.id END) AS fail_count,
        COUNT(DISTINCT CASE WHEN r.status = 'pending' THEN s.id END) AS pending_count
       FROM exams e
       LEFT JOIN exam_students s ON s.exam_id = e.id
       LEFT JOIN exam_results r ON r.student_id = s.id AND r.exam_id = e.id
       WHERE e.id = $1
       GROUP BY e.id, e.name`,
      [req.params.examId]
    );

    res.json(analyticsResult.rows[0]);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ message: 'Could not load analytics.' });
  }
});

app.get('/api/exams/:examId/room', requireExaminer, async (req, res) => {
  try {
    const roomResult = await pool.query(
      `SELECT e.id, e.room_code, COUNT(s.id) AS participant_count
       FROM exams e
       LEFT JOIN exam_students s ON s.exam_id = e.id
       WHERE e.id = $1 AND e.examiner_id = $2
       GROUP BY e.id, e.room_code`,
      [req.params.examId, req.examiner.examinerId]
    );

    res.json(roomResult.rows[0] || { id: req.params.examId, room_code: null, participant_count: 0 });
  } catch (error) {
    console.error('Room info error:', error);
    res.status(500).json({ message: 'Could not load room info.' });
  }
});

app.post('/api/exams/:examId/questions', requireExaminer, async (req, res) => {
  const { questionText } = req.body;

  if (!questionText) {
    return res.status(400).json({ message: 'Question text is required.' });
  }

  try {
    const examResult = await pool.query(
      'SELECT id FROM exams WHERE id = $1 AND examiner_id = $2',
      [req.params.examId, req.examiner.examinerId]
    );

    if (!examResult.rows[0]) {
      return res.status(404).json({ message: 'Exam not found for this examiner.' });
    }

    const orderResult = await pool.query(
      'SELECT COALESCE(MAX(question_order), 0) + 1 AS next_order FROM exam_questions WHERE exam_id = $1',
      [req.params.examId]
    );
    const result = await pool.query(
      'INSERT INTO exam_questions (exam_id, question_text, question_order) VALUES ($1, $2, $3) RETURNING id, question_text, question_order',
      [req.params.examId, questionText.trim(), orderResult.rows[0].next_order]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add question error:', error);
    res.status(500).json({ message: 'Could not add question.' });
  }
});

app.put('/api/exams/:examId/results/:studentId', requireExaminer, async (req, res) => {
  const { score, status, feedback } = req.body;

  try {
    const examResult = await pool.query(
      'SELECT id FROM exams WHERE id = $1 AND examiner_id = $2',
      [req.params.examId, req.examiner.examinerId]
    );

    if (!examResult.rows[0]) {
      return res.status(404).json({ message: 'Exam not found for this examiner.' });
    }

    const normalizedStatus = normalizeResultStatus(status);
    const parsedScore = score === '' || score === null || score === undefined ? null : Number(score);
    const result = await pool.query(
      `INSERT INTO exam_results (exam_id, student_id, status, score, max_score, feedback, submitted_at, graded_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       ON CONFLICT (exam_id, student_id)
       DO UPDATE SET status = excluded.status, score = excluded.score, max_score = excluded.max_score, feedback = excluded.feedback, graded_at = now()
       RETURNING id, status, score, max_score, feedback, submitted_at, graded_at`,
      [req.params.examId, req.params.studentId, normalizedStatus, parsedScore, null, String(feedback || '').trim() || null]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update result error:', error);
    res.status(500).json({ message: 'Could not update student result.' });
  }
});

app.get('/api/exams/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const status = normalizeExamStatus(req.query.status, true);

  if (!query) {
    return res.json([]);
  }

  try {
    const result = await pool.query(
      `SELECT id, name, examiner_name, status
       FROM exams
       WHERE lower(name) LIKE lower($1)
         AND ($2 = 'all' OR status = $2)
       ORDER BY created_at DESC
       LIMIT 10`,
      [`%${query}%`, status === 'draft' || status === 'published' || status === 'closed' ? status : 'all']
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Could not search exams.' });
  }
});

app.post('/api/student-login', async (req, res) => {
  const { examId, username, password } = req.body;

  if (!examId || !username || !password) {
    return res.status(400).json({ message: 'Exam, username, and password are required.' });
  }

  try {
    const result = await pool.query(
      `SELECT s.id, s.full_name, s.password_hash, e.name AS exam_name, e.status AS exam_status, e.start_at, e.end_at, e.randomize_questions, e.duration_minutes, e.room_code
       FROM exam_students s
       JOIN exams e ON e.id = s.exam_id
       WHERE s.exam_id = $1 AND s.username = $2`,
      [examId, username.trim()]
    );

    const student = result.rows[0];

    if (!student || !(await bcrypt.compare(password, student.password_hash))) {
      return res.status(401).json({ message: 'Invalid username or password for this exam.' });
    }

    const now = new Date();
    const startAt = student.start_at ? new Date(student.start_at) : null;
    const endAt = student.end_at ? new Date(student.end_at) : null;
    const examOpen = student.exam_status === 'published' && (!startAt || startAt <= now) && (!endAt || endAt >= now);

    if (!examOpen) {
      return res.status(403).json({ message: 'This exam is not open for submissions right now.' });
    }

    const questionsResult = await pool.query(
      'SELECT id, question_text, question_order FROM exam_questions WHERE exam_id = $1 ORDER BY question_order, created_at',
      [examId]
    );
    const orderedQuestions = student.randomize_questions ? shuffleQuestions(questionsResult.rows) : questionsResult.rows;

    setSessionCookie(res, 'student_session', {
      type: 'student',
      studentId: student.id,
      studentName: student.full_name,
      examId,
      examName: student.exam_name
    });

    res.json({
      studentId: student.id,
      studentName: student.full_name,
      examName: student.exam_name,
      questions: orderedQuestions,
      durationMinutes: student.duration_minutes,
      roomCode: student.room_code
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not log in.' });
  }
});

app.post('/api/student-logout', (req, res) => {
  clearSessionCookie(res, 'student_session');
  res.json({ message: 'Logged out.' });
});

app.get('/api/student-session', requireStudent, (req, res) => {
  res.json({ studentId: req.student.studentId, studentName: req.student.studentName, examId: req.student.examId, examName: req.student.examName });
});

app.get('/api/students/me/exam', requireStudent, async (req, res) => {
  try {
    const examResult = await pool.query(
      `SELECT e.name AS exam_name, e.duration_minutes, e.randomize_questions, e.room_code
       FROM exams e
       WHERE e.id = $1`,
      [req.student.examId]
    );

    const exam = examResult.rows[0];
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found.' });
    }

    const questionsResult = await pool.query(
      'SELECT id, question_text, question_order FROM exam_questions WHERE exam_id = $1 ORDER BY question_order, created_at',
      [req.student.examId]
    );

    const orderedQuestions = exam.randomize_questions ? shuffleQuestions(questionsResult.rows) : questionsResult.rows;

    res.json({
      studentId: req.student.studentId,
      studentName: req.student.studentName,
      examId: req.student.examId,
      examName: exam.exam_name,
      questions: orderedQuestions,
      durationMinutes: exam.duration_minutes,
      roomCode: exam.room_code
    });
  } catch (error) {
    console.error('Student exam restore error:', error);
    res.status(500).json({ message: 'Could not load exam questions.' });
  }
});

app.post('/api/student-answers', requireStudent, async (req, res) => {
  const { answers } = req.body;
  const studentId = req.body.studentId || req.student.studentId;

  if (!studentId || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ message: 'Student and answers are required.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const answer of answers) {
      const answerText = String(answer.answerText || '').trim();

      if (!answer.questionId || !answerText) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Every question needs an answer.' });
      }

      await client.query(
        `INSERT INTO student_answers (student_id, question_id, answer_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (student_id, question_id)
         DO UPDATE SET answer_text = excluded.answer_text, submitted_at = now()`,
        [studentId, answer.questionId, answerText]
      );
    }

    await client.query(
      `INSERT INTO exam_results (exam_id, student_id, status, score, max_score, feedback, submitted_at, graded_at)
       SELECT s.exam_id, s.id, 'submitted', NULL, NULL, NULL, now(), NULL
       FROM exam_students s
       WHERE s.id = $1
       ON CONFLICT (exam_id, student_id)
       DO UPDATE SET status = 'submitted', submitted_at = now(), graded_at = NULL`,
      [studentId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Answers submitted successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Submit answers error:', error);
    res.status(500).json({ message: 'Could not submit answers.' });
  } finally {
    client.release();
  }
});

app.post('/api/student-password-reset', async (req, res) => {
  const { username, examId, newPassword } = req.body;
  if (!username || !examId || !newPassword) {
    return res.status(400).json({ message: 'Username, exam, and a new password are required.' });
  }

  try {
    const result = await pool.query('SELECT id FROM exam_students WHERE exam_id = $1 AND username = $2', [examId, username.trim()]);
    const student = result.rows[0];
    if (!student) {
      return res.status(404).json({ message: 'No matching student account found.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE exam_students SET password_hash = $1 WHERE id = $2', [passwordHash, student.id]);
    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Student reset error:', error);
    res.status(500).json({ message: 'Could not reset password.' });
  }
});

app.get('/api/students/me/history', requireStudent, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id AS exam_id, e.name AS exam_name, e.status AS exam_status, r.status AS result_status, r.score, r.max_score, r.submitted_at, r.graded_at
       FROM exam_results r
       JOIN exam_students s ON s.id = r.student_id
       JOIN exams e ON e.id = s.exam_id
       WHERE r.student_id = $1
       ORDER BY r.submitted_at DESC, e.created_at DESC`,
      [req.student.studentId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Student history error:', error);
    res.status(500).json({ message: 'Could not load student history.' });
  }
});

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      app.listen(port, () => {
        console.log(`Exam portal running at http://localhost:${port}`);
      });
    })
    .catch((error) => {
      console.error('Database initialization failed:', error);
      process.exit(1);
    });
}

module.exports = {
  app,
  buildInviteEmailContent,
  shuffleQuestions
};
