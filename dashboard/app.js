const API = '/api';
const $ = (selector) => document.querySelector(selector);
const toast = (message) => { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); };
async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
const dateText = (date) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date));
function drawApplications(apps) {
  const search = $('#search').value.toLowerCase();
  const list = apps.filter((app) => `${app.company} ${app.title} ${app.status}`.toLowerCase().includes(search));
  const rows = $('#application-rows');
  $('#empty-state').hidden = apps.length > 0;
  rows.innerHTML = list.map((app) => `<tr><td class="role-cell"><strong>${escapeHtml(app.title)}</strong><small>${escapeHtml(app.company)}${app.location ? ` · ${escapeHtml(app.location)}` : ''}</small></td><td class="date-cell">${dateText(app.createdAt)}</td><td><select class="status-select status-${escapeHtml(app.status)}" data-status="${app.id}" aria-label="Status for ${escapeHtml(app.title)}">${['Saved','Applied','Interview','Offer','Rejected'].map((s) => `<option ${s === app.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td><button class="delete-row" data-delete="${app.id}" title="Delete application" aria-label="Delete ${escapeHtml(app.title)}">×</button></td></tr>`).join('');
  $('#nav-count').textContent = apps.length;
  $('#stat-total').textContent = apps.length;
  $('#stat-progress').textContent = apps.filter((a) => ['Saved','Applied'].includes(a.status)).length;
  $('#stat-interviews').textContent = apps.filter((a) => a.status === 'Interview').length;
  $('#stat-offers').textContent = apps.filter((a) => a.status === 'Offer').length;
}
let applications = [];
async function loadApplications() { applications = await request('/applications'); drawApplications(applications); }
async function loadProfile() {
  const profile = await request('/profile'); const form = $('#profile-form');
  for (const [key, value] of Object.entries(profile)) if (form.elements[key]) form.elements[key].value = value || '';
}
async function loadSettings() {
  const settings = await request('/settings'); const form = $('#settings-form');
  form.elements.model.value = settings.model; $('#provider-chip').textContent = settings.hasApiKey ? 'GEMINI' : 'LOCAL';
  $('#key-state').textContent = settings.hasApiKey ? `Key configured · ${settings.provider}` : 'No key configured · local drafts active';
}
$('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  try { await request('/profile', { method: 'PUT', body: JSON.stringify(data) }); $('#profile-message').textContent = 'Saved just now'; toast('Profile saved on this computer.'); }
  catch (error) { toast(error.message); }
});
$('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  try { await request('/settings', { method: 'PUT', body: JSON.stringify(data) }); event.currentTarget.elements.apiKey.value = ''; await loadSettings(); toast('AI settings saved.'); }
  catch (error) { toast(error.message); }
});
function openDialog() { $('#application-form').reset(); $('#application-dialog').showModal(); }
$('#empty-add').addEventListener('click', openDialog);
document.querySelectorAll('a[href="#applications"]').forEach((el) => el.addEventListener('click', (event) => { if (el.classList.contains('button')) { event.preventDefault(); openDialog(); } }));
$('#close-dialog').addEventListener('click', () => $('#application-dialog').close());
$('#cancel-dialog').addEventListener('click', () => $('#application-dialog').close());
$('#application-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  try { await request('/applications', { method: 'POST', body: JSON.stringify(data) }); $('#application-dialog').close(); await loadApplications(); toast('Application added.'); }
  catch (error) { toast(error.message); }
});
$('#application-rows').addEventListener('change', async (event) => {
  if (!event.target.dataset.status) return; const app = applications.find((item) => item.id === event.target.dataset.status);
  try { await request(`/applications/${app.id}`, { method: 'PUT', body: JSON.stringify({ status: event.target.value }) }); await loadApplications(); toast('Application status updated.'); }
  catch (error) { toast(error.message); }
});
$('#application-rows').addEventListener('click', async (event) => {
  const id = event.target.dataset.delete; if (!id) return;
  if (!confirm('Remove this application from your tracker?')) return;
  try { await request(`/applications/${id}`, { method: 'DELETE' }); await loadApplications(); toast('Application removed.'); }
  catch (error) { toast(error.message); }
});
$('#search').addEventListener('input', () => drawApplications(applications));
$('#refresh').addEventListener('click', () => loadApplications().catch((error) => toast(error.message)));
Promise.all([loadApplications(), loadProfile(), loadSettings()]).catch((error) => toast(error.message));
