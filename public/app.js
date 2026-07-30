const views = document.querySelectorAll('.view');
const navButtons = document.querySelectorAll('[data-view]');
const studentsList = document.querySelector('#students-list');
const questionsList = document.querySelector('#questions-list');
const addStudentButton = document.querySelector('#add-student');
const addQuestionButton = document.querySelector('#add-question');
const examForm = document.querySelector('#exam-form');
const createStatus = document.querySelector('#create-status');
const examinerLoginForm = document.querySelector('#examiner-login-form');
const adminDashboard = document.querySelector('#admin-dashboard');
const adminStatus = document.querySelector('#admin-status');
const adminExams = document.querySelector('#admin-exams');
const adminExamTitle = document.querySelector('#admin-exam-title');
const addQuestionForm = document.querySelector('#add-question-form');
const adminQuestionText = document.querySelector('#admin-question-text');
const adminQuestions = document.querySelector('#admin-questions');
const adminAnswers = document.querySelector('#admin-answers');
const searchForm = document.querySelector('#search-form');
const examSearch = document.querySelector('#exam-search');
const searchResults = document.querySelector('#search-results');
const loginForm = document.querySelector('#login-form');
const selectedExamId = document.querySelector('#selected-exam-id');
const selectedExamName = document.querySelector('#selected-exam-name');
const loginStatus = document.querySelector('#login-status');
const answerForm = document.querySelector('#answer-form');
const studentExamTitle = document.querySelector('#student-exam-title');
const answerQuestions = document.querySelector('#answer-questions');
const answerStatus = document.querySelector('#answer-status');

let currentExaminer = null;
let currentAdminExamId = null;
let currentStudent = null;

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function showView(viewId) {
  views.forEach((view) => view.classList.toggle('hidden', view.id !== viewId));
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

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json();

  if (!response.ok) throw new Error(data.message || 'Request failed.');
  return data;
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.view));
});

addStudentButton.addEventListener('click', addStudentRow);
addQuestionButton.addEventListener('click', addQuestionRow);

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
        students,
        questions
      })
    });

    examForm.reset();
    studentsList.innerHTML = '';
    questionsList.innerHTML = '';
    addStudentRow();
    addQuestionRow();
    setStatus(createStatus, `Created "${data.exam.name}" with ${data.studentCount} student(s) and ${data.questionCount} question(s).`);
  } catch (error) {
    setStatus(createStatus, error.message, true);
  }
});

async function loadExaminerExams() {
  const exams = await requestJson(`/api/examiners/${currentExaminer.examinerId}/exams`);
  adminExams.innerHTML = '';

  if (!exams.length) {
    adminExams.textContent = 'No exams yet.';
    return;
  }

  exams.forEach((exam) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result-button';
    button.textContent = exam.name;
    const meta = document.createElement('span');
    meta.textContent = `${exam.student_count} students, ${exam.question_count} questions`;
    button.appendChild(meta);
    button.addEventListener('click', () => loadAdminExam(exam.id));
    adminExams.appendChild(button);
  });
}

async function loadAdminExam(examId) {
  currentAdminExamId = examId;
  const data = await requestJson(`/api/exams/${examId}/admin?examinerId=${encodeURIComponent(currentExaminer.examinerId)}`);
  adminExamTitle.textContent = data.exam.name;
  addQuestionForm.classList.remove('hidden');
  adminQuestions.innerHTML = data.questions.length ? '' : 'No questions yet.';
  adminAnswers.innerHTML = data.answers.length ? '' : 'No answers submitted yet.';

  data.questions.forEach((question) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.textContent = `${question.question_order}. ${question.question_text}`;
    adminQuestions.appendChild(item);
  });

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

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  searchResults.innerHTML = '';
  loginForm.classList.add('hidden');
  answerForm.classList.add('hidden');

  const exams = await requestJson(`/api/exams/search?q=${encodeURIComponent(examSearch.value)}`);

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
    examiner.textContent = `Examiner: ${exam.examiner_name}`;
    button.appendChild(examiner);
    button.addEventListener('click', () => {
      selectedExamId.value = exam.id;
      selectedExamName.textContent = exam.name;
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
    setStatus(answerStatus, data.message);
  } catch (error) {
    setStatus(answerStatus, error.message, true);
  }
});

addStudentRow();
addQuestionRow();
