const test = require('node:test');
const assert = require('node:assert/strict');

function buildInviteEmailContent({ recipient, examName, appUrl }) {
  const baseUrl = appUrl || process.env.APP_URL || 'http://localhost:3000';
  return {
    subject: `You’re invited to ${examName}`,
    text: `Hello,\n\n${recipient} has been invited to join the exam \"${examName}\" on ExamHub.\nOpen ${baseUrl} to continue.\n`
  };
}

test('buildInviteEmailContent includes exam details and app link', () => {
  const content = buildInviteEmailContent({
    recipient: 'student@example.com',
    examName: 'Biology Final',
    appUrl: 'http://localhost:3000'
  });

  assert.match(content.subject, /Biology Final/);
  assert.match(content.text, /student@example.com/);
  assert.match(content.text, /http:\/\/localhost:3000/);
});
