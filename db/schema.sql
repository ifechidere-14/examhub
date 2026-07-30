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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE INDEX IF NOT EXISTS exam_students_exam_id_idx ON exam_students (exam_id);

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

CREATE INDEX IF NOT EXISTS exam_questions_exam_id_idx ON exam_questions (exam_id);
CREATE INDEX IF NOT EXISTS student_answers_student_id_idx ON student_answers (student_id);
