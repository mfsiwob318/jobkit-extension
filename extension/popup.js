const API = 'http://127.0.0.1:8787/api';
const $ = (selector) => document.querySelector(selector);
const elements = { title: $('#job-title'), company: $('#job-company'), location: $('#job-location'), description: $('#job-description') };
let activeTabId = null;
let currentJob = {};
let currentKit = null;
let profile = {};
const say = (message) => { const box = $('#notice'); box.textContent = message; box.classList.add('show'); setTimeout(() => box.classList.remove('show'), 2600); };
async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Backend request failed');
  return data;
}
function jobFromForm() { return { title: elements.title.value.trim(), company: elements.company.value.trim(), location: elements.location.value.trim(), description: elements.description.value.trim(), url: $('#page-url').dataset.url || '' }; }
function setJob(job) {
  currentJob = job || {};
  for (const key of ['title','company','location','description']) if (currentJob[key]) elements[key].value = currentJob[key];
  const url = currentJob.url || ''; $('#page-url').textContent = url; $('#page-url').dataset.url = url;
}
async function init() {
  try {
    await api('/health'); $('#connection-state').textContent = 'Local workspace connected';
    const [storedProfile, apps] = await Promise.all([api('/profile'), api('/applications')]); profile = storedProfile;
    if (!elements.title.value && activeTabId !== null) {
      try { const job = await chrome.tabs.sendMessage(activeTabId, { type: 'JOBKIT_GET_JOB' }); if (job) setJob(job); } catch { /* restricted browser pages do not expose content scripts */ }
    }
    renderRecent(apps.slice(0, 4));
  } catch (error) {
    $('#connection-state').textContent = 'Backend offline · start the local server'; $('.live-dot').classList.add('offline');
    $('#recent-list').innerHTML = '<span class="muted">Start the local backend to sync your tracker.</span>';
  }
}
function renderRecent(apps) {
  $('#recent-list').innerHTML = apps.length ? apps.map((app) => `<div class="recent-item"><div><b>${safe(app.title)}</b><small>${safe(app.company)}</small></div><span class="recent-status">${safe(app.status)}</span></div>`).join('') : '<span class="muted">No applications tracked yet.</span>';
}
function safe(value = '') { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
async function generate() {
  const job = jobFromForm();
  if (!job.title && !job.description) return say('Add a job title or description first.');
  const button = $('#generate'); button.disabled = true; button.textContent = 'Creating your kit…';
  try {
    currentKit = await api('/generate', { method: 'POST', body: JSON.stringify({ job }) });
    $('#kit-summary').value = currentKit.resumeSummary || '';
    $('#kit-cover').value = currentKit.coverLetter || '';
    $('#kit-source').textContent = currentKit.source === 'gemini' ? 'Generated with your Gemini key' : 'Generated locally · no API key';
    $('#screening-answers').innerHTML = (currentKit.screeningAnswers || []).map((item, index) => `<div class="answer-item"><label for="answer-${index}">${safe(item.question)}</label><textarea id="answer-${index}" data-answer="${index}" rows="3">${safe(item.answer)}</textarea></div>`).join('');
    $('#kit-area').hidden = false; say('Your draft kit is ready. Give it a review.');
  } catch (error) { say(error.message); }
  finally { button.disabled = false; button.innerHTML = '✧ &nbsp; Create application kit'; }
}
function getKit() {
  return { ...(currentKit || {}), resumeSummary: $('#kit-summary').value, coverLetter: $('#kit-cover').value, screeningAnswers: [...document.querySelectorAll('[data-answer]')].map((field) => ({ question: field.previousElementSibling.textContent, answer: field.value })) };
}
async function fillForm() {
  if (!currentKit) return say('Create an application kit first.');
  if (!confirm('Fill matching fields on this page using your saved profile and this draft? Nothing will be submitted.')) return;
  try {
    const result = await chrome.tabs.sendMessage(activeTabId, { type: 'JOBKIT_FILL_FORM', profile, kit: getKit() });
    if (result?.error) return say(result.error);
    say(result?.filled ? `Filled ${result.filled} field${result.filled === 1 ? '' : 's'} — review before submitting.` : 'No matching form fields found.');
  } catch { say('Could not access this page. Refresh it and try again.'); }
}
async function saveApplication() {
  const job = jobFromForm();
  if (!job.title && !job.company) return say('Add a company or job title first.');
  try {
    const apps = await api('/applications', { method: 'POST', body: JSON.stringify({ ...job, status: 'Saved', kit: currentKit ? getKit() : null }) });
    const current = await api('/applications'); renderRecent(current.slice(0, 4)); say(`Saved ${apps.title} to your tracker.`);
  } catch (error) { say(error.message); }
}
$('#generate').addEventListener('click', generate);
$('#regenerate').addEventListener('click', generate);
$('#autofill').addEventListener('click', fillForm);
$('#save-application').addEventListener('click', saveApplication);
$('#open-dashboard').addEventListener('click', () => chrome.tabs.create({ url: 'http://127.0.0.1:8787/' }));
$('#view-all').addEventListener('click', (event) => { event.preventDefault(); chrome.tabs.create({ url: 'http://127.0.0.1:8787/#applications' }); });
(async () => { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); activeTabId = tab?.id ?? null; if (tab?.url) { $('#page-url').textContent = tab.url; $('#page-url').dataset.url = tab.url; } await init(); })();
