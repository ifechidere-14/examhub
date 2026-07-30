const studentsList = document.querySelector('#students-list');
const addStudentButton = document.querySelector('#add-student');
const examForm = document.querySelector('#exam-form');
const createStatus = document.querySelector('#create-status');
const searchForm = document.querySelector('#search-form');
const examSearch = document.querySelector('#exam-search');
const searchResults = document.querySelector('#search-results');
const loginForm = document.querySelector('#login-form');
const selectedExamId = document.querySelector('#selected-exam-id');
const selectedExamName = document.querySelector('#selected-exam-name');
const loginStatus = document.querySelector('#login-status');

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

function addStudentRow(student = {}) {
  const row = document.createElement('div');
  row.className = 'student-row';
  row.innerHTML = `
    <label>
      Full name
      <input class="student-name" value="${student.fullName || ''}" placeholder="Ama Boateng" required>
    </label>
    <label>
      Username
      <input class="student-username" value="${student.username || ''}" placeholder="ama01" required>
    </label>
    <label>
      Password
      <input class="student-password" type="password" value="${student.password || ''}" required>
    </label>
    <button class="remove-student" type="button">Remove</button>
  `;

  row.querySelector('.remove-student').addEventListener('click', () => {
    if (studentsList.children.length > 1) {
      row.remove();
    }
  });

  studentsList.appendChild(row);
}

addStudentButton.addEventListener('click', () => addStudentRow());

examForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(createStatus, 'Creating exam...');

  const students = [...studentsList.querySelectorAll('.student-row')].map((row) => ({
    fullName: row.querySelector('.student-name').value,
    username: row.querySelector('.student-username').value,
    password: row.querySelector('.student-password').value
  }));

  const payload = {
    examName: examForm.examName.value,
    examinerName: examForm.examinerName.value,
    students
  };

  try {
    const response = await fetch('/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Could not create exam.');
    }

    examForm.reset();
    studentsList.innerHTML = '';
    addStudentRow();
    setStatus(createStatus, `Created "${data.exam.name}" with ${data.studentCount} student(s).`);
  } catch (error) {
    setStatus(createStatus, error.message, true);
  }
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  searchResults.innerHTML = '';
  loginForm.classList.add('hidden');

  const response = await fetch(`/api/exams/search?q=${encodeURIComponent(examSearch.value)}`);
  const exams = await response.json();

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
  setStatus(loginStatus, 'Checking login...');

  try {
    const response = await fetch('/api/student-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: selectedExamId.value,
        username: document.querySelector('#student-username').value,
        password: document.querySelector('#student-password').value
      })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed.');
    }

    setStatus(loginStatus, `Welcome ${data.studentName}. You are logged in for ${data.examName}.`);
  } catch (error) {
    setStatus(loginStatus, error.message, true);
  }
});

addStudentRow();
