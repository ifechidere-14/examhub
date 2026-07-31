const views = document.querySelectorAll('.view');
const navButtons = document.querySelectorAll('[data-view]');
const studentsList = document.querySelector('#students-list');
const questionsList = document.querySelector('#questions-list');
const addStudentButton = document.querySelector('#add-student');
const addQuestionButton = document.querySelector('#add-question');
const importStudentsButton = document.querySelector('#import-students-button');
const importStudentsFile = document.querySelector('#import-students-file');
const importStatus = document.querySelector('#import-status');
const examForm = document.querySelector('#exam-form');
const createStatus = document.querySelector('#create-status');
const examinerLoginForm = document.querySelector('#examiner-login-form');
const adminDashboard = document.querySelector('#admin-dashboard');
const adminStatus = document.querySelector('#admin-status');
const examinerResetForm = document.querySelector('#examiner-password-reset-form');
const examinerResetStatus = document.querySelector('#examiner-reset-status');
const examinerInviteForm = document.querySelector('#examiner-invite-form');
const examinerInviteEmail = document.querySelector('#examiner-invite-email');
const examinerInviteExam = document.querySelector('#examiner-invite-exam');
const examinerInviteStatus = document.querySelector('#examiner-invite-status');
const adminExams = document.querySelector('#admin-exams');
const adminExamTitle = document.querySelector('#admin-exam-title');
const adminExamMeta = document.querySelector('#admin-exam-meta');
const addQuestionForm = document.querySelector('#add-question-form');
const adminQuestionText = document.querySelector('#admin-question-text');
const adminQuestions = document.querySelector('#admin-questions');
const adminAnswers = document.querySelector('#admin-answers');
const adminResults = document.querySelector('#admin-results');
const adminAnalytics = document.querySelector('#admin-analytics');
const adminRoom = document.querySelector('#admin-room');
const exportResultsButton = document.querySelector('#export-results-button');
const languageSwitch = document.querySelector('#language-switch');
const themeToggle = document.querySelector('#theme-toggle');
const searchForm = document.querySelector('#search-form');
const examSearch = document.querySelector('#exam-search');
const examStatusFilter = document.querySelector('#exam-status-filter');
const searchResults = document.querySelector('#search-results');
const loginForm = document.querySelector('#login-form');
const selectedExamId = document.querySelector('#selected-exam-id');
const selectedExamName = document.querySelector('#selected-exam-name');
const loginStatus = document.querySelector('#login-status');
const answerForm = document.querySelector('#answer-form');
const studentExamTitle = document.querySelector('#student-exam-title');
const studentTimer = document.querySelector('#student-timer');
const answerQuestions = document.querySelector('#answer-questions');
const answerStatus = document.querySelector('#answer-status');
const studentHistory = document.querySelector('#student-history');
const studentResetForm = document.querySelector('#student-password-reset-form');
const studentResetStatus = document.querySelector('#student-reset-status');
const studentResetExamId = document.querySelector('#student-reset-exam-id');
const examinerLogoutButton = document.querySelector('#examiner-logout');
const studentLogoutButton = document.querySelector('#student-logout');

let currentExaminer = null;
let currentAdminExamId = null;
let currentStudent = null;
let currentStudentTimer = null;
let currentLanguage = 'en';
let darkModeEnabled = false;

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function showView(viewId) {
  views.forEach((view) => view.classList.toggle('hidden', view.id !== viewId));
}

function formatDateTime(value) {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleString();
}

function translateUi() {
  const translations = {
    en: {
      pageTitle: 'Online exam workspace',
      navCreate: 'Create Exam',
      navAdmin: 'Examiner Admin',
      navStudent: 'Student Exam',
      roleExaminer: 'Examiner',
      createHeading: 'Create exam and account',
      roleAdmin: 'Admin',
      adminHeading: 'Manage exams and answers',
      roleStudent: 'Student',
      studentHeading: 'Find and write your exam',
      languageLabel: 'Language'
    },
    pt: {
      pageTitle: 'Espaço de provas online',
      navCreate: 'Criar prova',
      navAdmin: 'Admin do examinador',
      navStudent: 'Prova do aluno',
      roleExaminer: 'Examinador',
      createHeading: 'Criar prova e conta',
      roleAdmin: 'Admin',
      adminHeading: 'Gerir provas e respostas',
      roleStudent: 'Aluno',
      studentHeading: 'Encontrar e responder à prova',
      languageLabel: 'Idioma'
    },
    fr: {
      pageTitle: 'Espace d’examen en ligne',
      navCreate: 'Créer un examen',
      navAdmin: 'Admin examinateur',
      navStudent: 'Examen étudiant',
      roleExaminer: 'Examinateur',
      createHeading: 'Créer un examen et un compte',
      roleAdmin: 'Admin',
      adminHeading: 'Gérer les examens et réponses',
      roleStudent: 'Étudiant',
      studentHeading: 'Trouver et passer l’examen',
      languageLabel: 'Langue'
    }
  };

  const content = translations[currentLanguage] || translations.en;
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (content[key]) {
      element.textContent = content[key];
    }
  });
}

function applyTheme() {
  document.body.classList.toggle('dark', darkModeEnabled);
  themeToggle.textContent = darkModeEnabled ? 'Light mode' : 'Dark mode';
}

function startStudentTimer(durationMinutes) {
  if (!durationMinutes || Number(durationMinutes) <= 0) {
    studentTimer.classList.add('hidden');
    return;
  }

  const totalSeconds = Number(durationMinutes) * 60;
  let remainingSeconds = totalSeconds;
  studentTimer.classList.remove('hidden');
  studentTimer.textContent = `Time left: ${Math.floor(totalSeconds / 60)}m`;

  if (currentStudentTimer) clearInterval(currentStudentTimer);
  currentStudentTimer = setInterval(() => {
    remainingSeconds -= 1;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    studentTimer.textContent = `Time left: ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
    if (remainingSeconds <= 0) {
      clearInterval(currentStudentTimer);
      studentTimer.textContent = 'Time is up';
      answerForm.requestSubmit();
    }
  }, 1000);
}

function showTabWarning() {
  setStatus(answerStatus, 'Please stay on this tab while taking the exam.', true);
}

function createInputRow(className, fields) {
  const row = document.createElement('div');
  row.className = className;

  fields.forEach((field) => {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = field.multiline ? document.createElement('textarea') : document.createElement('input');
    input.className = field.className;
    input.placeholder = field.placeholder || '';
    input.required = true;
    if (field.type) input.type = field.type;
    label.appendChild(input);
    row.appendChild(label);
  });

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'remove-button';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    if (row.parentElement.children.length > 1) row.remove();
  });
  row.appendChild(removeButton);

  return row;
}

function addStudentRow() {
  studentsList.appendChild(createInputRow('student-row', [
    { label: 'Full name', className: 'student-name', placeholder: 'Ama Boateng' },
    { label: 'Username', className: 'student-username', placeholder: 'ama01' },
    { label: 'Password', className: 'student-password', type: 'password' }
  ]));
}

function addQuestionRow() {
  questionsList.appendChild(createInputRow('question-row', [
    { label: 'Question', className: 'question-text', multiline: true, placeholder: 'Explain photosynthesis.' }
  ]));
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  const values = [];

  const pushValue = () => {
    values.push(current.trim());
    current = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      pushValue();
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      pushValue();
      if (values.some((value) => value.length)) {
        rows.push(values);
      }
      values.length = 0;
    } else {
      current += char;
    }
  }

  if (current.length || values.length) {
    pushValue();
    if (values.some((value) => value.length)) {
      rows.push(values);
    }
  }

  return rows;
}

function importStudentsFromCsv(file) {
  if (!file) {
    setStatus(importStatus, 'Choose a CSV file first.', true);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(reader.result || '');
    if (!rows.length) {
      setStatus(importStatus, 'The selected file is empty.', true);
      return;
    }

    const header = rows[0].map((value) => value.toLowerCase().trim());
    const records = rows.slice(1).filter((row) => row.some((value) => value.trim()));
    const mappedRows = records.map((row) => {
      const entry = {};
      header.forEach((key, index) => {
        entry[key] = row[index] || '';
      });
      return entry;
    });

    if (!mappedRows.length) {
      setStatus(importStatus, 'No student records were found in the CSV.', true);
      return;
    }

    studentsList.innerHTML = '';
    mappedRows.forEach((student) => {
      studentsList.appendChild(createInputRow('student-row', [
        { label: 'Full name', className: 'student-name', placeholder: 'Ama Boateng' },
        { label: 'Username', className: 'student-username', placeholder: 'ama01' },
        { label: 'Password', className: 'student-password', type: 'password' }
      ]));
    });

    const rowsInDom = studentsList.querySelectorAll('.student-row');
    rowsInDom.forEach((row, index) => {
      const student = mappedRows[index];
      row.querySelector('.student-name').value = student.fullname || student.name || student.full_name || '';
      row.querySelector('.student-username').value = student.username || '';
      row.querySelector('.student-password').value = student.password || '';
    });

    setStatus(importStatus, `Imported ${mappedRows.length} student record(s).`);
  };
  reader.onerror = () => {
    setStatus(importStatus, 'Could not read the selected file.', true);
  };
  reader.readAsText(file);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json();

  if (!response.ok) throw new Error(data.message || 'Request failed.');
  return data;
}

async function restoreExaminerSession() {
  try {
    currentExaminer = await requestJson('/api/examiner-session');
    adminDashboard.classList.remove('hidden');
    setStatus(adminStatus, `Logged in as ${currentExaminer.examinerName}.`);
    await loadExaminerExams();
  } catch (error) {
    currentExaminer = null;
    adminDashboard.classList.add('hidden');
  }
}

async function restoreStudentSession() {
  try {
    currentStudent = await requestJson('/api/student-session');
    studentExamTitle.textContent = `${currentStudent.examName} - ${currentStudent.studentName}`;
    await loadStudentHistory(currentStudent.studentId);
    answerForm.classList.remove('hidden');
    setStatus(loginStatus, '');
  } catch (error) {
    currentStudent = null;
    answerForm.classList.add('hidden');
  }
}

function createResultCard(student, result) {
  const item = document.createElement('div');
  item.className = 'item';
  item.innerHTML = `
    <strong></strong>
    <p></p>
    <div class="inline-actions">
      <label>
        <span>Status</span>
        <select class="result-status"></select>
      </label>
      <label>
        <span>Score</span>
        <input class="result-score" type="number" min="0">
      </label>
      <label>
        <span>Feedback</span>
        <textarea class="result-feedback"></textarea>
      </label>
      <button type="button" class="result-save">Save</button>
    </div>
  `;

  item.querySelector('strong').textContent = `${student.full_name} (${student.username})`;
  item.querySelector('p').textContent = result?.result_status ? `Status: ${result.result_status}` : 'No grading yet.';

  const statusSelect = item.querySelector('.result-status');
  statusSelect.innerHTML = '<option value="pending">Pending</option><option value="submitted">Submitted</option><option value="graded">Graded</option>';
  statusSelect.value = result?.result_status || 'pending';

  const scoreInput = item.querySelector('.result-score');
  scoreInput.value = result?.score ?? '';

  const feedbackInput = item.querySelector('.result-feedback');
  feedbackInput.value = result?.feedback || '';

  item.querySelector('.result-save').addEventListener('click', async () => {
    try {
      await requestJson(`/api/exams/${currentAdminExamId}/results/${student.student_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          examinerId: currentExaminer.examinerId,
          status: statusSelect.value,
          score: scoreInput.value,
          feedback: feedbackInput.value
        })
      });
      setStatus(adminStatus, `Saved grading for ${student.full_name}.`);
      await loadAdminExam(currentAdminExamId);
    } catch (error) {
      setStatus(adminStatus, error.message, true);
    }
  });

  return item;
}

async function loadStudentHistory(studentId) {
  const history = await requestJson('/api/students/me/history');
  studentHistory.innerHTML = '';
  studentHistory.classList.remove('hidden');

  if (!history.length) {
    studentHistory.textContent = 'No submissions yet.';
    return;
  }

  history.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `<strong></strong><p></p><span></span>`;
    item.querySelector('strong').textContent = entry.exam_name;
    item.querySelector('p').textContent = `Status: ${entry.result_status || 'pending'}${entry.score !== null && entry.score !== undefined ? ` • Score: ${entry.score}` : ''}`;
    item.querySelector('span').textContent = entry.submitted_at ? `Submitted ${formatDateTime(entry.submitted_at)}` : 'No submission yet';
    studentHistory.appendChild(item);
  });
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.view));
});

addStudentButton.addEventListener('click', addStudentRow);
addQuestionButton.addEventListener('click', addQuestionRow);
importStudentsButton.addEventListener('click', () => importStudentsFromCsv(importStudentsFile.files[0]));

examForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(createStatus, 'Creating exam...');

  const students = [...studentsList.querySelectorAll('.student-row')].map((row) => ({
    fullName: row.querySelector('.student-name').value,
    username: row.querySelector('.student-username').value,
    password: row.querySelector('.student-password').value
  }));
  const questions = [...questionsList.querySelectorAll('.question-row')].map((row) => ({
    questionText: row.querySelector('.question-text').value
  }));

  try {
    const data = await requestJson('/api/exams', {
      method: 'POST',
      body: JSON.stringify({
        examName: examForm.examName.value,
        examinerName: examForm.examinerName.value,
        examinerUsername: examForm.examinerUsername.value,
        examinerPassword: examForm.examinerPassword.value,
        examStatus: examForm.examStatus.value,
        startAt: examForm.examStart.value || null,
        endAt: examForm.examEnd.value || null,
        passingScore: examForm.passingScore.value || null,
        randomizeQuestions: examForm.randomizeQuestions.checked,
        durationMinutes: examForm.durationMinutes.value || null,
        roomCode: examForm.roomCode.value || null,
        students,
        questions
      })
    });

    examForm.reset();
    studentsList.innerHTML = '';
    questionsList.innerHTML = '';
    importStudentsFile.value = '';
    setStatus(importStatus, '');
    addStudentRow();
    addQuestionRow();
    setStatus(createStatus, `Created "${data.exam.name}" with ${data.studentCount} student(s) and ${data.questionCount} question(s).`);
  } catch (error) {
    setStatus(createStatus, error.message, true);
  }
});

function populateInviteExamOptions(exams) {
  examinerInviteExam.innerHTML = '';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = 'Select an exam';
  examinerInviteExam.appendChild(emptyOption);

  exams.forEach((exam) => {
    const option = document.createElement('option');
    option.value = exam.id;
    option.textContent = exam.name;
    examinerInviteExam.appendChild(option);
  });

  if (currentAdminExamId) {
    examinerInviteExam.value = currentAdminExamId;
  }
}

async function loadExaminerExams() {
  const exams = await requestJson('/api/examiners/me/exams');
  adminExams.innerHTML = '';

  if (!exams.length) {
    adminExams.textContent = 'No exams yet.';
    populateInviteExamOptions([]);
    return;
  }

  populateInviteExamOptions(exams);

  exams.forEach((exam) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result-button';
    button.textContent = exam.name;
    const meta = document.createElement('span');
    meta.textContent = `${exam.student_count} students, ${exam.question_count} questions • ${exam.status}`;
    button.appendChild(meta);
    button.addEventListener('click', () => loadAdminExam(exam.id));
    adminExams.appendChild(button);
  });
}

async function loadAdminExam(examId) {
  currentAdminExamId = examId;
  const data = await requestJson(`/api/exams/${examId}/admin?examinerId=${encodeURIComponent(currentExaminer.examinerId)}`);
  const [analytics, room] = await Promise.all([
    requestJson(`/api/exams/${examId}/analytics`).catch(() => null),
    requestJson(`/api/exams/${examId}/room`).catch(() => null)
  ]);
  adminExamTitle.textContent = data.exam.name;
  adminExamMeta.innerHTML = `
    <p><strong>Status:</strong> ${data.exam.status}</p>
    <p><strong>Starts:</strong> ${formatDateTime(data.exam.start_at)}</p>
    <p><strong>Ends:</strong> ${formatDateTime(data.exam.end_at)}</p>
    <p><strong>Passing score:</strong> ${data.exam.passing_score ?? 'Not set'}</p>
  `;
  addQuestionForm.classList.remove('hidden');
  adminQuestions.innerHTML = '';
  adminAnswers.innerHTML = '';
  adminResults.innerHTML = '';
  adminAnalytics.innerHTML = '';
  adminRoom.innerHTML = '';
  adminAnalytics.classList.toggle('hidden', !analytics);
  adminRoom.classList.toggle('hidden', !room);

  if (analytics) {
    adminAnalytics.innerHTML = `
      <p><strong>Students:</strong> ${analytics.student_count ?? 0}</p>
      <p><strong>Submitted:</strong> ${analytics.submitted_count ?? 0}</p>
      <p><strong>Graded:</strong> ${analytics.graded_count ?? 0}</p>
      <p><strong>Average score:</strong> ${analytics.average_score ?? 'N/A'}</p>
      <p><strong>Passes:</strong> ${analytics.pass_count ?? 0}</p>
    `;
  }

  if (room) {
    adminRoom.innerHTML = `
      <p><strong>Room:</strong> ${room.room_code || 'No room code'}</p>
      <p><strong>Participants:</strong> ${room.participant_count ?? 0}</p>
    `;
  }

  if (!data.questions.length) {
    adminQuestions.textContent = 'No questions yet.';
  } else {
    data.questions.forEach((question) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.textContent = `${question.question_order}. ${question.question_text}`;
      adminQuestions.appendChild(item);
    });
  }

  if (!data.answers.length) {
    adminAnswers.textContent = 'No answers submitted yet.';
  } else {
    data.answers.forEach((answer) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `<strong></strong><p></p><span></span>`;
      item.querySelector('strong').textContent = `${answer.full_name} (${answer.username})`;
      item.querySelector('p').textContent = answer.answer_text;
      item.querySelector('span').textContent = answer.question_text;
      adminAnswers.appendChild(item);
    });
  }

  if (!data.results.length) {
    adminResults.textContent = 'No results yet.';
  } else {
    data.results.forEach((result) => {
      adminResults.appendChild(createResultCard(result, result));
    });
  }
}

examinerResetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(examinerResetStatus, 'Resetting password...');

  try {
    await requestJson('/api/examiner-password-reset', {
      method: 'POST',
      body: JSON.stringify({
        username: document.querySelector('#examiner-reset-username').value,
        recoveryName: document.querySelector('#examiner-reset-name').value,
        newPassword: document.querySelector('#examiner-reset-password').value
      })
    });
    examinerResetForm.reset();
    setStatus(examinerResetStatus, 'Password updated successfully.');
  } catch (error) {
    setStatus(examinerResetStatus, error.message, true);
  }
});

examinerInviteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(examinerInviteStatus, 'Sending invite...');

  try {
    await requestJson('/api/examiner-invite', {
      method: 'POST',
      body: JSON.stringify({
        email: examinerInviteEmail.value,
        examId: examinerInviteExam.value
      })
    });
    examinerInviteForm.reset();
    setStatus(examinerInviteStatus, 'Invitation queued.');
  } catch (error) {
    setStatus(examinerInviteStatus, error.message, true);
  }
});

examinerLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(adminStatus, 'Logging in...');

  try {
    currentExaminer = await requestJson('/api/examiner-login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.querySelector('#examiner-login-username').value,
        password: document.querySelector('#examiner-login-password').value
      })
    });
    adminDashboard.classList.remove('hidden');
    setStatus(adminStatus, `Logged in as ${currentExaminer.examinerName}.`);
    await loadExaminerExams();
  } catch (error) {
    setStatus(adminStatus, error.message, true);
  }
});

examinerLogoutButton.addEventListener('click', async () => {
  await requestJson('/api/examiner-logout', { method: 'POST' });
  currentExaminer = null;
  adminDashboard.classList.add('hidden');
  setStatus(adminStatus, 'Logged out.');
});

addQuestionForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await requestJson(`/api/exams/${currentAdminExamId}/questions`, {
      method: 'POST',
      body: JSON.stringify({
        examinerId: currentExaminer.examinerId,
        questionText: adminQuestionText.value
      })
    });
    adminQuestionText.value = '';
    await loadAdminExam(currentAdminExamId);
    await loadExaminerExams();
  } catch (error) {
    setStatus(adminStatus, error.message, true);
  }
});

exportResultsButton.addEventListener('click', async () => {
  if (!currentAdminExamId) {
    setStatus(adminStatus, 'Select an exam first.', true);
    return;
  }

  const rows = [...adminResults.querySelectorAll('.item')].map((item) => {
    const name = item.querySelector('strong')?.textContent || '';
    const status = item.querySelector('.result-status')?.value || '';
    const score = item.querySelector('.result-score')?.value || '';
    const feedback = item.querySelector('.result-feedback')?.value || '';
    return `${name},${status},${score},${feedback}`;
  });

  const csv = ['student,status,score,feedback', ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `exam-results-${currentAdminExamId}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

studentResetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(studentResetStatus, 'Resetting password...');

  try {
    await requestJson('/api/student-password-reset', {
      method: 'POST',
      body: JSON.stringify({
        username: document.querySelector('#student-reset-username').value,
        examId: studentResetExamId.value,
        newPassword: document.querySelector('#student-reset-password').value
      })
    });
    studentResetForm.reset();
    setStatus(studentResetStatus, 'Password updated successfully.');
  } catch (error) {
    setStatus(studentResetStatus, error.message, true);
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  searchResults.innerHTML = '';
  loginForm.classList.add('hidden');
  answerForm.classList.add('hidden');
  studentHistory.classList.add('hidden');

  const exams = await requestJson(`/api/exams/search?q=${encodeURIComponent(examSearch.value)}&status=${encodeURIComponent(examStatusFilter.value)}`);

  if (!exams.length) {
    searchResults.textContent = 'No exams found.';
    return;
  }

  exams.forEach((exam) => {
    const button = document.createElement('button');
    const examiner = document.createElement('span');
    button.type = 'button';
    button.className = 'result-button';
    button.textContent = exam.name;
    examiner.textContent = `Examiner: ${exam.examiner_name} • ${exam.status}`;
    button.appendChild(examiner);
    button.addEventListener('click', () => {
      selectedExamId.value = exam.id;
      studentResetExamId.value = exam.id;
      selectedExamName.textContent = exam.name;
      studentResetForm.classList.remove('hidden');
      loginForm.classList.remove('hidden');
      setStatus(loginStatus, '');
    });
    searchResults.appendChild(button);
  });
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(loginStatus, 'Starting exam...');

  try {
    currentStudent = await requestJson('/api/student-login', {
      method: 'POST',
      body: JSON.stringify({
        examId: selectedExamId.value,
        username: document.querySelector('#student-username').value,
        password: document.querySelector('#student-password').value
      })
    });

    studentExamTitle.textContent = `${currentStudent.examName} - ${currentStudent.studentName}`;
    startStudentTimer(currentStudent.durationMinutes);
    answerQuestions.innerHTML = '';

    if (!currentStudent.questions.length) {
      answerQuestions.textContent = 'This exam has no questions yet.';
    }

    currentStudent.questions.forEach((question) => {
      const label = document.createElement('label');
      label.textContent = `${question.question_order}. ${question.question_text}`;
      const textarea = document.createElement('textarea');
      textarea.dataset.questionId = question.id;
      textarea.required = true;
      label.appendChild(textarea);
      answerQuestions.appendChild(label);
    });

    await loadStudentHistory(currentStudent.studentId);
    answerForm.classList.remove('hidden');
    setStatus(loginStatus, '');
  } catch (error) {
    setStatus(loginStatus, error.message, true);
  }
});

answerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(answerStatus, 'Submitting answers...');

  const answers = [...answerQuestions.querySelectorAll('textarea')].map((textarea) => ({
    questionId: textarea.dataset.questionId,
    answerText: textarea.value
  }));

  try {
    const data = await requestJson('/api/student-answers', {
      method: 'POST',
      body: JSON.stringify({ studentId: currentStudent.studentId, answers })
    });
    await loadStudentHistory(currentStudent.studentId);
    setStatus(answerStatus, data.message);
  } catch (error) {
    setStatus(answerStatus, error.message, true);
  }
});

studentLogoutButton.addEventListener('click', async () => {
  await requestJson('/api/student-logout', { method: 'POST' });
  currentStudent = null;
  answerForm.classList.add('hidden');
  studentHistory.classList.add('hidden');
  studentResetForm.classList.add('hidden');
  setStatus(loginStatus, 'Logged out.');
});

languageSwitch.addEventListener('change', () => {
  currentLanguage = languageSwitch.value;
  translateUi();
});

themeToggle.addEventListener('click', () => {
  darkModeEnabled = !darkModeEnabled;
  applyTheme();
});

document.addEventListener('visibilitychange', () => {
  if (!currentStudent || document.visibilityState !== 'hidden') return;
  showTabWarning();
});

addStudentRow();
addQuestionRow();
translateUi();
applyTheme();
restoreExaminerSession();
restoreStudentSession();
