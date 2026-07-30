const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Add it to .env before using CockroachDB.');
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

  await pool.query('ALTER TABLE exams ADD COLUMN IF NOT EXISTS examiner_id UUID REFERENCES examiners (id) ON DELETE SET NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS exam_students_exam_id_idx ON exam_students (exam_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS exam_questions_exam_id_idx ON exam_questions (exam_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS student_answers_student_id_idx ON student_answers (student_id)');
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
  const { examName, examinerName, examinerUsername, examinerPassword, students, questions } = req.body;

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

    const examResult = await client.query(
      'INSERT INTO exams (name, examiner_name, examiner_id) VALUES ($1, $2, $3) RETURNING id, name, examiner_name, created_at',
      [examName.trim(), examinerName.trim(), examiner.id]
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

    res.json({ examinerId: examiner.id, examinerName: examiner.full_name, username: examiner.username });
  } catch (error) {
    console.error('Examiner login error:', error);
    res.status(500).json({ message: 'Could not log examiner in.' });
  }
});

app.get('/api/examiners/:examinerId/exams', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.name, e.created_at,
        count(DISTINCT s.id) AS student_count,
        count(DISTINCT q.id) AS question_count
       FROM exams e
       LEFT JOIN exam_students s ON s.exam_id = e.id
       LEFT JOIN exam_questions q ON q.exam_id = e.id
       WHERE e.examiner_id = $1
       GROUP BY e.id, e.name, e.created_at
       ORDER BY e.created_at DESC`,
      [req.params.examinerId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Examiner exams error:', error);
    res.status(500).json({ message: 'Could not load examiner exams.' });
  }
});

app.get('/api/exams/:examId/admin', async (req, res) => {
  const examinerId = String(req.query.examinerId || '').trim();

  if (!examinerId) {
    return res.status(400).json({ message: 'Examiner is required.' });
  }

  try {
    const examResult = await pool.query(
      'SELECT id, name, examiner_name FROM exams WHERE id = $1 AND examiner_id = $2',
      [req.params.examId, examinerId]
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

    res.json({ exam, questions: questionsResult.rows, answers: answersResult.rows });
  } catch (error) {
    console.error('Exam admin error:', error);
    res.status(500).json({ message: 'Could not load exam admin page.' });
  }
});

app.post('/api/exams/:examId/questions', async (req, res) => {
  const { examinerId, questionText } = req.body;

  if (!examinerId || !questionText) {
    return res.status(400).json({ message: 'Examiner and question text are required.' });
  }

  try {
    const examResult = await pool.query(
      'SELECT id FROM exams WHERE id = $1 AND examiner_id = $2',
      [req.params.examId, examinerId]
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

app.get('/api/exams/search', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!query) {
    return res.json([]);
  }

  try {
    const result = await pool.query(
      `SELECT id, name, examiner_name
       FROM exams
       WHERE lower(name) LIKE lower($1)
       ORDER BY created_at DESC
       LIMIT 10`,
      [`%${query}%`]
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
      `SELECT s.id, s.full_name, s.password_hash, e.name AS exam_name
       FROM exam_students s
       JOIN exams e ON e.id = s.exam_id
       WHERE s.exam_id = $1 AND s.username = $2`,
      [examId, username.trim()]
    );

    const student = result.rows[0];

    if (!student || !(await bcrypt.compare(password, student.password_hash))) {
      return res.status(401).json({ message: 'Invalid username or password for this exam.' });
    }

    const questionsResult = await pool.query(
      'SELECT id, question_text, question_order FROM exam_questions WHERE exam_id = $1 ORDER BY question_order, created_at',
      [examId]
    );

    res.json({
      studentId: student.id,
      studentName: student.full_name,
      examName: student.exam_name,
      questions: questionsResult.rows
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not log in.' });
  }
});

app.post('/api/student-answers', async (req, res) => {
  const { studentId, answers } = req.body;

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
