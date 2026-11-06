import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'backend', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DEFAULT_PROFILE = { name: '', email: '', phone: '', location: '', headline: '', summary: '', skills: '', experience: '', education: '', website: '', linkedin: '' };
const initialData = { profile: DEFAULT_PROFILE, applications: [], settings: { geminiApiKey: '', model: 'gemini-2.5-flash' } };

await mkdir(DATA_DIR, { recursive: true });
if (!existsSync(DATA_FILE)) await writeFile(DATA_FILE, JSON.stringify(initialData, null, 2), { mode: 0o600 });

async function loadStore() {
  try { return { ...initialData, ...JSON.parse(await readFile(DATA_FILE, 'utf8')) }; }
  catch { return structuredClone(initialData); }
}
async function saveStore(data) {
  const temp = `${DATA_FILE}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  const { rename } = await import('node:fs/promises');
  await rename(temp, DATA_FILE);
}
function send(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
}
function corsHeaders(origin) {
  const ok = !origin || origin === 'http://127.0.0.1:8787' || origin === 'http://localhost:8787' || origin.startsWith('chrome-extension://');
  return ok ? { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } : {};
}
async function bodyJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}
const text = (value, max = 5000) => String(value ?? '').trim().slice(0, max);
function titleCase(s) { return s.replace(/\b\w/g, (c) => c.toUpperCase()); }
function fallbackKit(job, profile) {
  const jobTitle = text(job.title, 180) || 'the advertised role';
  const company = text(job.company, 180) || 'your organization';
  const skills = text(profile.skills, 1000).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const keySkills = skills.slice(0, 6).join(', ') || 'my relevant experience and transferable skills';
  const summary = text(profile.summary, 1200) || text(profile.experience, 1200) || 'my background and experience';
  const coverLetter = `Dear Hiring Team,\n\nI am writing to apply for the ${jobTitle} position at ${company}. My background in ${keySkills} aligns with the needs of this role.\n\nIn my recent work, I have developed strengths in ${keySkills}. ${summary}\n\nI would welcome the opportunity to discuss how I can contribute to ${company}. Thank you for your consideration.\n\nSincerely,\n${text(profile.name, 120) || '[Your name]'}`;
  return {
    resumeSummary: `${text(profile.headline, 240) || jobTitle} | ${keySkills}. ${summary}`.slice(0, 1600),
    coverLetter,
    screeningAnswers: [
      { question: 'Why are you interested in this role?', answer: `This role matches my experience in ${keySkills}, and I am interested in contributing to ${company}.` },
      { question: 'What relevant experience do you bring?', answer: summary.slice(0, 1000) },
      { question: 'When can you start?', answer: 'I can discuss a mutually suitable start date.' }
    ],
    source: 'local-template'
  };
}
async function generateKit(job, profile, settings) {
  const apiKey = process.env.GEMINI_API_KEY || settings.geminiApiKey;
  if (!apiKey) return fallbackKit(job, profile);
  const model = text(process.env.GEMINI_MODEL || settings.model || 'gemini-2.5-flash', 100);
  const prompt = `Create a truthful, tailored job application kit using only the facts provided. Never invent credentials, employers, dates, degrees, or achievements. Return ONLY JSON with keys resumeSummary, coverLetter, screeningAnswers (array of {question,answer}).\nCANDIDATE PROFILE:\n${JSON.stringify(profile)}\nJOB:\n${JSON.stringify(job)}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}. Check the model, key, and free-tier availability.`);
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  return { ...parsed, source: 'gemini' };
}
async function serveStatic(res, pathname) {
  const routes = { '/': 'dashboard/index.html', '/dashboard.js': 'dashboard/app.js', '/dashboard.css': 'dashboard/styles.css' };
  const rel = routes[pathname];
  if (!rel) return false;
  const ext = path.extname(rel);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  res.writeHead(200, { 'Content-Type': types[ext], 'Cache-Control': 'no-cache' });
  res.end(await readFile(path.join(ROOT, rel)));
  return true;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const cors = corsHeaders(origin);
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      if (origin && Object.keys(cors).length === 0) return send(res, 403, { error: 'Origin not allowed' });
      const store = await loadStore();
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, aiConfigured: Boolean(process.env.GEMINI_API_KEY || store.settings.geminiApiKey) }, cors);
      if (req.method === 'GET' && url.pathname === '/api/profile') return send(res, 200, store.profile, cors);
      if (req.method === 'PUT' && url.pathname === '/api/profile') {
        const input = await bodyJson(req);
        store.profile = Object.fromEntries(Object.keys(DEFAULT_PROFILE).map((key) => [key, text(input[key], key === 'experience' || key === 'summary' ? 10000 : 2000)]));
        await saveStore(store); return send(res, 200, store.profile, cors);
      }
      if (req.method === 'GET' && url.pathname === '/api/applications') return send(res, 200, store.applications, cors);
      if (req.method === 'POST' && url.pathname === '/api/applications') {
        const input = await bodyJson(req);
        if (!text(input.company) && !text(input.title)) return send(res, 400, { error: 'Company or job title is required.' }, cors);
        const app = { id: crypto.randomUUID(), company: text(input.company, 180) || 'Unknown company', title: text(input.title, 180) || 'Untitled role', url: text(input.url, 2000), location: text(input.location, 180), status: text(input.status, 40) || 'Saved', notes: text(input.notes, 2000), createdAt: new Date().toISOString(), kit: input.kit || null };
        store.applications.unshift(app); await saveStore(store); return send(res, 201, app, cors);
      }
      const appMatch = url.pathname.match(/^\/api\/applications\/([\w-]+)$/);
      if (appMatch && req.method === 'PUT') {
        const input = await bodyJson(req); const item = store.applications.find((a) => a.id === appMatch[1]);
        if (!item) return send(res, 404, { error: 'Application not found.' }, cors);
        for (const key of ['status', 'notes']) if (input[key] !== undefined) item[key] = text(input[key], 2000);
        await saveStore(store); return send(res, 200, item, cors);
      }
      if (appMatch && req.method === 'DELETE') {
        const before = store.applications.length; store.applications = store.applications.filter((a) => a.id !== appMatch[1]);
        if (before === store.applications.length) return send(res, 404, { error: 'Application not found.' }, cors);
        await saveStore(store); return send(res, 200, { ok: true }, cors);
      }
      if (req.method === 'GET' && url.pathname === '/api/settings') return send(res, 200, { hasApiKey: Boolean(process.env.GEMINI_API_KEY || store.settings.geminiApiKey), model: store.settings.model || 'gemini-2.5-flash', provider: process.env.GEMINI_API_KEY ? 'environment' : store.settings.geminiApiKey ? 'stored' : 'local' }, cors);
      if (req.method === 'PUT' && url.pathname === '/api/settings') {
        const input = await bodyJson(req); store.settings.model = text(input.model, 100) || 'gemini-2.5-flash';
        if (input.apiKey !== undefined && !process.env.GEMINI_API_KEY) store.settings.geminiApiKey = text(input.apiKey, 300);
        await saveStore(store); return send(res, 200, { hasApiKey: Boolean(process.env.GEMINI_API_KEY || store.settings.geminiApiKey), model: store.settings.model, provider: process.env.GEMINI_API_KEY ? 'environment' : store.settings.geminiApiKey ? 'stored' : 'local' }, cors);
      }
      if (req.method === 'POST' && url.pathname === '/api/generate') {
        const input = await bodyJson(req);
        if (!text(input.job?.description) && !text(input.job?.title)) return send(res, 400, { error: 'Provide a job title or description first.' }, cors);
        const kit = await generateKit(input.job, store.profile, store.settings);
        return send(res, 200, kit, cors);
      }
      return send(res, 404, { error: 'API route not found.' }, cors);
    }
    if (req.method === 'GET' && await serveStatic(res, url.pathname)) return;
    send(res, 404, { error: 'Not found.' });
  } catch (error) {
    send(res, 500, { error: error.message || 'Unexpected server error.' });
  }
});
server.listen(PORT, HOST, () => console.log(`JobKit backend and dashboard running at http://${HOST}:${PORT}`));
