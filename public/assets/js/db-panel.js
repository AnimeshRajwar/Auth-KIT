'use strict';
 
// ─── Panel-local state ──────────────────────────────────
let currentDbType  = 'postgres';
let dbPanelOpen    = false;
let dbTypeLocked   = false;
let dbTestPassed   = false;
let dbTestedUrl    = '';
let dbTestedType   = '';
 
// ─── Helpers ────────────────────────────────────────────
 
function detectDbTypeFromUrl(url) {
  if (!url) return 'postgres';
  if (url.startsWith('postgres'))                            return 'postgres';
  if (url.startsWith('mysql'))                               return 'mysql';
  if (url.startsWith('mongodb://') || url.startsWith('mongodb+srv://')) return 'mongodb';
  return 'postgres';
}
 
function updateDbTypePillsVisibility() {
  ['postgres', 'mysql', 'mongodb'].forEach(t => {
    const pill = document.getElementById(`pill-${t}`);
    if (!pill) return;
    pill.style.display = (!dbTypeLocked || t === currentDbType) ? '' : 'none';
  });
}
 
// ─── Panel open/close ────────────────────────────────────
 
function toggleDbPanel() {
  dbPanelOpen = !dbPanelOpen;
  document.getElementById('db-panel-body').classList.toggle('open', dbPanelOpen);
  document.getElementById('db-chevron').classList.toggle('open', dbPanelOpen);
}
 
// ─── Type selection ──────────────────────────────────────
 
function selectDbType(type) {
  if (dbTypeLocked && type !== currentDbType) return;
  currentDbType = type;
  _applyDbTypePills(type);
  updateDbTypePillsVisibility();
  _applyDbTypeHints(type, true);
  clearTestResult();
}
 
/** Silent variant used during auto-detect (does not clear URL or hint). */
function selectDbTypeSilent(type) {
  if (dbTypeLocked && type !== currentDbType) return;
  currentDbType = type;
  _applyDbTypePills(type);
  updateDbTypePillsVisibility();
}
 
function _applyDbTypePills(type) {
  ['postgres', 'mysql', 'mongodb'].forEach(t => {
    document.getElementById(`pill-${t}`).classList.toggle('active', t === type);
  });
}
 
function _applyDbTypeHints(type, clearInput) {
  const input = document.getElementById('db-url-input');
  const hint  = document.getElementById('db-hint');
 
  const configs = {
    postgres: {
      hint:        'postgres://user:password@host:5432/dbname',
      placeholder: 'postgres://user:password@host:5432/dbname',
      prefix:      'postgres',
    },
    mysql: {
      hint:        'mysql://user:password@host:3306/dbname',
      placeholder: 'mysql://user:password@host:3306/dbname',
      prefix:      'mysql',
    },
    mongodb: {
      hint:        'mongodb+srv://user:password@cluster.example.mongodb.net/dbname',
      placeholder: 'mongodb+srv://user:password@cluster.example.mongodb.net/dbname',
      prefix:      'mongodb',
    },
  };
 
  const cfg = configs[type];
  hint.textContent  = cfg.hint;
  input.placeholder = cfg.placeholder;
 
  if (clearInput && !input.value.startsWith(cfg.prefix)) {
    input.value = '';
  }
}
 
// ─── URL change / auto-detect ────────────────────────────
 
function onDbUrlChange() {
  clearTestResult();
  if (dbTypeLocked) return;
  const val = document.getElementById('db-url-input').value;
  if      (val.startsWith('postgres'))                             selectDbTypeSilent('postgres');
  else if (val.startsWith('mysql'))                                selectDbTypeSilent('mysql');
  else if (val.startsWith('mongodb://') || val.startsWith('mongodb+srv://')) selectDbTypeSilent('mongodb');
}
 
// ─── Test result ─────────────────────────────────────────
 
function clearTestResult() {
  const el = document.getElementById('db-test-result');
  el.className  = 'db-test-result';
  el.textContent = '';
  dbTestPassed  = false;
  dbTestedUrl   = '';
  dbTestedType  = '';
}
 
function showTestResult(type, msg) {
  const el = document.getElementById('db-test-result');
  el.className   = `db-test-result ${type}`;
  el.textContent = msg;
}
 
// ─── Test connection ─────────────────────────────────────
 
async function testDbConnection() {
  const url = document.getElementById('db-url-input').value.trim();
  const btn = document.getElementById('db-test-btn');
  const dot = document.getElementById('db-status-dot');
 
  if (!url) { showTestResult('err', 'Enter a connection URL first'); return; }
 
  setBtnLoading(btn, true, 'Testing...');
  dot.className = 'db-status-dot testing';
 
  const { ok, data } = await api('POST', `/p/${currentProjectId}/db/test`, { db_url: url });
  setBtnLoading(btn, false, 'Test');
 
  if (ok) {
    dot.className  = 'db-status-dot connected';
    showTestResult('ok', `✓ Connected — ${data.type}`);
    dbTestPassed  = true;
    dbTestedUrl   = url;
    dbTestedType  = data.type || detectDbTypeFromUrl(url);
    updateUserCount();
  } else {
    dot.className = 'db-status-dot error';
    showTestResult('err', `✗ ${data.message || 'Connection failed'}`);
    dbTestPassed  = false;
    dbTestedUrl   = '';
    dbTestedType  = '';
  }
}
 
// ─── Save DB URL ─────────────────────────────────────────
 
async function saveDbUrl() {
  const url = document.getElementById('db-url-input').value.trim();
  if (!url) { showTestResult('err', 'Connection URL is required'); return; }
  if (!dbTestPassed || dbTestedUrl !== url) {
    showTestResult('err', 'Please test the current connection URL before saving');
    return;
  }
 
  await _saveDbUrlToServer(url);
  currentDbType  = dbTestedType || detectDbTypeFromUrl(url);
  dbTypeLocked   = true;
  updateDbTypePillsVisibility();
  toast('✓ Database URL saved');
}
 
async function _saveDbUrlToServer(url) {
  await api('PATCH', `/projects/${currentProjectId}`, { db_url: url || null });
 
  const proj = projects.find(p => p.id === currentProjectId);
  if (proj) {
    proj.db_url  = url || null;
    proj.db_type = detectDbTypeFromUrl(proj.db_url);
  }
 
  if (url) {
    dbTypeLocked = true;
    selectDbTypeSilent(detectDbTypeFromUrl(url));
  }
}
 
// ─── User-count badge ────────────────────────────────────
 
async function updateUserCount() {
  const { ok, data } = await api('GET', `/p/${currentProjectId}/stats`);
  const badge = document.getElementById('user-count-badge');
  if (badge) badge.textContent = ok && data.user_count !== null ? data.user_count : '—';
}
 
function refreshUserCountNow() {
  updateUserCount();
}
 
function startUserCountAutoRefresh() {
  stopUserCountAutoRefresh();
  userCountInterval = setInterval(() => {
    const pageProject = document.getElementById('page-project');
    if (!pageProject || pageProject.classList.contains('hidden') || !currentProjectId) return;
    updateUserCount();
  }, 10_000);
}
 
function stopUserCountAutoRefresh() {
  if (userCountInterval) {
    clearInterval(userCountInterval);
    userCountInterval = null;
  }
}
 
// ─── Panel init ──────────────────────────────────────────
 
function initDbPanel(project) {
  const url  = project.db_url || '';
  const type = detectDbTypeFromUrl(url);
 
  currentDbType = type;
  dbTypeLocked  = !!url;
  dbTestPassed  = false;
  dbTestedUrl   = '';
  dbTestedType  = '';
 
  _applyDbTypePills(type);
  updateDbTypePillsVisibility();
 
  const input = document.getElementById('db-url-input');
  input.value = url;
 
  // Status dot + label
  const dot   = document.getElementById('db-status-dot');
  const label = document.getElementById('db-type-label');
  dot.className  = url ? 'db-status-dot connected' : 'db-status-dot error';
  label.textContent = url
    ? ({ postgres: 'PostgreSQL', mysql: 'MySQL', mongodb: 'MongoDB' }[type] || type)
    : 'Not configured';
 
  _applyDbTypeHints(type, false);
 
  // Endpoint snippets — fill in real project ID
  ['snip-base', 'snip-base2', 'snip-base3', 'snip-base4', 'snip-base5'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `/p/${currentProjectId}/auth/`;
  });
 
  clearTestResult();
  dbPanelOpen = false;
  document.getElementById('db-panel-body').classList.remove('open');
  document.getElementById('db-chevron').classList.remove('open');
 
  updateUserCount();
}
 