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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : undefined
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

  await pool.query('CREATE INDEX IF NOT EXISTS exam_students_exam_id_idx ON exam_students (exam_id)');
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
  const { examName, examinerName, students } = req.body;

  if (!examName || !examinerName || !Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ message: 'Exam name, examiner name, and at least one student are required.' });
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

    const examResult = await client.query(
      'INSERT INTO exams (name, examiner_name) VALUES ($1, $2) RETURNING id, name, examiner_name, created_at',
      [examName.trim(), examinerName.trim()]
    );

    const exam = examResult.rows[0];

    for (const student of cleanStudents) {
      const passwordHash = await bcrypt.hash(student.password, 10);
      await client.query(
        'INSERT INTO exam_students (exam_id, full_name, username, password_hash) VALUES ($1, $2, $3, $4)',
        [exam.id, student.fullName, student.username, passwordHash]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ exam, studentCount: cleanStudents.length });
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

    res.json({
      studentId: student.id,
      studentName: student.full_name,
      examName: student.exam_name
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not log in.' });
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
