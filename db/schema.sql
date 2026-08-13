CREATE TABLE IF NOT EXISTS examiners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name STRING NOT NULL,
  username STRING NOT NULL UNIQUE,
  password_hash STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
);

CREATE TABLE IF NOT EXISTS exam_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  full_name STRING NOT NULL,
  username STRING NOT NULL,
  password_hash STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, username)
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  question_text STRING NOT NULL,
  question_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES exam_students (id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES exam_questions (id) ON DELETE CASCADE,
  answer_text STRING NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, question_id)
);

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
);

CREATE TABLE IF NOT EXISTS exam_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  email STRING NOT NULL,
  status STRING NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, email)
);

CREATE INDEX IF NOT EXISTS exam_students_exam_id_idx ON exam_students (exam_id);
CREATE INDEX IF NOT EXISTS exam_questions_exam_id_idx ON exam_questions (exam_id);
CREATE INDEX IF NOT EXISTS student_answers_student_id_idx ON student_answers (student_id);
CREATE INDEX IF NOT EXISTS exam_results_exam_id_idx ON exam_results (exam_id);

-- Extended schema for additional features

ALTER TABLE IF EXISTS exams ADD COLUMN IF NOT EXISTS randomize_questions BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS exams ADD COLUMN IF NOT EXISTS duration_minutes INT;
ALTER TABLE IF EXISTS exams ADD COLUMN IF NOT EXISTS room_code STRING;

-- Rich question types and metadata
ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS question_type STRING NOT NULL DEFAULT 'text';
ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS max_score INT;
ALTER TABLE IF EXISTS exam_questions ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Multiple-choice options table (for MCQ questions)
CREATE TABLE IF NOT EXISTS mcq_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES exam_questions (id) ON DELETE CASCADE,
  option_text STRING NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  option_order INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS mcq_options_question_id_idx ON mcq_options (question_id);

-- Question pools and weighted selection
CREATE TABLE IF NOT EXISTS question_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  name STRING NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pool_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES question_pools (id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES exam_questions (id) ON DELETE CASCADE,
  weight INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS pool_questions_pool_id_idx ON pool_questions (pool_id);

-- Student drafts (autosave)
CREATE TABLE IF NOT EXISTS student_drafts (
  student_id UUID PRIMARY KEY,
  draft JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exam versions and drafts
CREATE TABLE IF NOT EXISTS exam_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  author_id UUID REFERENCES examiners (id) ON DELETE SET NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, version_number)
);

-- Invitation tokens with roles and expiry
CREATE TABLE IF NOT EXISTS invite_tokens (
  token STRING PRIMARY KEY,
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  role STRING NOT NULL DEFAULT 'examiner',
  email STRING,
  expires_at TIMESTAMPTZ,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roles and audit logs
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name STRING NOT NULL UNIQUE,
  description STRING
);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examiner_id UUID NOT NULL REFERENCES examiners (id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (examiner_id, role_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_type STRING,
  action STRING NOT NULL,
  target_id UUID,
  target_type STRING,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_id);

-- Plagiarism reports
CREATE TABLE IF NOT EXISTS plagiarism_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES exam_students (id) ON DELETE CASCADE,
  answer_id UUID REFERENCES student_answers (id) ON DELETE SET NULL,
  score NUMERIC,
  report JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Examiner 2FA
CREATE TABLE IF NOT EXISTS examiner_2fa (
  examiner_id UUID PRIMARY KEY REFERENCES examiners (id) ON DELETE CASCADE,
  secret STRING,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS question_pools_exam_id_idx ON question_pools (exam_id);
CREATE INDEX IF NOT EXISTS invite_tokens_exam_id_idx ON invite_tokens (exam_id);


-- Autosave / draft storage for student answers
CREATE TABLE IF NOT EXISTS student_drafts (
  student_id UUID PRIMARY KEY,
  draft JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rich question types and MCQ options
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS question_type STRING NOT NULL DEFAULT 'short_answer';
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS max_score INT;

CREATE TABLE IF NOT EXISTS mcq_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES exam_questions (id) ON DELETE CASCADE,
  option_text STRING NOT NULL,
  is_correct BOOL NOT NULL DEFAULT false,
  option_order INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS mcq_options_question_idx ON mcq_options (question_id);

-- Code question testcases
CREATE TABLE IF NOT EXISTS code_testcases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES exam_questions (id) ON DELETE CASCADE,
  input TEXT,
  expected_output TEXT,
  points INT NOT NULL DEFAULT 1
);

-- File uploads for questions (student submissions)
CREATE TABLE IF NOT EXISTS student_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES exam_students (id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  question_id UUID REFERENCES exam_questions (id) ON DELETE SET NULL,
  file_path STRING NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Question pools and weighted selection
CREATE TABLE IF NOT EXISTS question_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  name STRING NOT NULL,
  description STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pool_questions (
  pool_id UUID NOT NULL REFERENCES question_pools (id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES exam_questions (id) ON DELETE CASCADE,
  weight INT NOT NULL DEFAULT 1,
  PRIMARY KEY (pool_id, question_id)
);

-- Exam versioning
CREATE TABLE IF NOT EXISTS exam_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  version INT NOT NULL,
  created_by UUID,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enhanced invites with tokens and expiry
ALTER TABLE exam_invites ADD COLUMN IF NOT EXISTS token STRING;
ALTER TABLE exam_invites ADD COLUMN IF NOT EXISTS role STRING DEFAULT 'student';
ALTER TABLE exam_invites ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE exam_invites ADD COLUMN IF NOT EXISTS used BOOL DEFAULT false;

-- Roles and audit logs
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name STRING NOT NULL UNIQUE,
  description STRING
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_type STRING,
  action STRING NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Proctoring events (tab switches, inactivity, webcam hooks)
CREATE TABLE IF NOT EXISTS proctor_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES exam_students (id) ON DELETE CASCADE,
  event_type STRING NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plagiarism check records
CREATE TABLE IF NOT EXISTS plagiarism_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES exam_students (id) ON DELETE CASCADE,
  similarity_score FLOAT,
  report JSONB,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Two-factor / MFA for examiners
CREATE TABLE IF NOT EXISTS examiner_mfa (
  examiner_id UUID PRIMARY KEY REFERENCES examiners (id) ON DELETE CASCADE,
  totp_secret STRING,
  enabled BOOL NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pluggable webhook audits (e.g., plagiarism, sms/email sends)
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name STRING NOT NULL,
  url STRING NOT NULL,
  events STRING[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS proctor_events_exam_idx ON proctor_events (exam_id);
CREATE INDEX IF NOT EXISTS plagiarism_checks_exam_idx ON plagiarism_checks (exam_id);
