'use strict';

// ─── Page Router ────────────────────────────────────────

function showPage(page, projectId) {
  stopUserCountAutoRefresh();
  closeMobileSidebar();

  document.getElementById('page-dashboard').classList.add('hidden');
  document.getElementById('page-project').classList.add('hidden');
  document.getElementById('page-docs').classList.add('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('topbar-actions').innerHTML = '';

  if (page === 'dashboard') {
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.getElementById('page-title').textContent = 'Projects';
    document.getElementById('page-dashboard').classList.remove('hidden');
    document.getElementById('nav-dashboard').classList.add('active');
    loadDashboard();

  } else if (page === 'project') {
    window.scrollTo({ top: 0, behavior: 'auto' });
    currentProjectId = projectId;
    document.getElementById('page-project').classList.remove('hidden');
    const navEl = document.getElementById(`nav-proj-${projectId}`);
    if (navEl) navEl.classList.add('active');
    loadProject(projectId);
    startUserCountAutoRefresh();

  } else if (page === 'docs') {
    document.getElementById('page-title').textContent = 'Documentation';
    document.getElementById('page-docs').classList.remove('hidden');
    document.getElementById('nav-docs').classList.add('active');
    const docsTop = Math.max(
      0,
      document.getElementById('page-docs').offsetTop - (isMobileViewport() ? 0 : 8)
    );
    window.scrollTo({ top: docsTop, behavior: 'auto' });
    initDocs();
  }
}

// ─── Dashboard ──────────────────────────────────────────

async function loadDashboard() {
  const { ok, data } = await api('GET', '/projects');
  if (!ok) return;

  projects = data.projects || [];
  const totalKeys = projects.reduce((a, p) => a + (p.key_count || 0), 0);

  document.getElementById('stat-projects').textContent = projects.length;
  document.getElementById('stat-keys').textContent     = totalKeys;

  // Sidebar project list
  const navList = document.getElementById('nav-projects-list');
  navList.innerHTML = projects.map(p => `
    <button class="nav-item" id="nav-proj-${p.id}"
            onclick="showPage('project','${p.id}'); closeMobileSidebar();">
      <span class="nav-icon">◈</span>
      <span class="nav-label">${escHtml(p.name)}</span>
    </button>
  `).join('');

  // Project grid
  const grid = document.getElementById('projects-grid');
  if (projects.length === 0) {
    grid.innerHTML = `
      <div class="new-project-card" onclick="openCreateProject()">
        <div class="new-project-plus">+</div>
        <div class="new-project-label">Create your first project</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = projects.map(p => `
    <div class="project-card" onclick="showPage('project','${p.id}')">
      <div class="project-card-header">
        <div class="project-icon">◈</div>
      </div>
      <div class="project-name">${escHtml(p.name)}</div>
      <div class="project-desc">${escHtml(p.description || 'No description')}</div>
      <div class="project-meta">
        <div class="meta-pill">🔑 ${p.key_count} key${p.key_count !== 1 ? 's' : ''}</div>
        <div class="meta-pill">📅 ${fmtDate(p.created_at)}</div>
      </div>
    </div>
  `).join('') + `
    <div class="new-project-card" onclick="openCreateProject()">
      <div class="new-project-plus">+</div>
      <div class="new-project-label">New Project</div>
    </div>
  `;
}

// ─── Project Detail ─────────────────────────────────────

async function loadProject(projectId) {
  const { ok, data } = await api('GET', `/projects/${projectId}`);
  if (!ok) { showPage('dashboard'); return; }

  const { project, api_keys } = data;
  document.getElementById('page-title').textContent  = project.name;
  document.getElementById('proj-title').textContent  = project.name;
  document.getElementById('proj-desc').textContent   = project.description || 'No description';

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.getElementById(`nav-proj-${projectId}`);
  if (navEl) navEl.classList.add('active');

  initDbPanel(project);
  renderKeysTable(api_keys, projectId);
}

function renderKeysTable(keys, projectId) {
  const container = document.getElementById('keys-container');

  if (!keys || keys.length === 0) {
    container.innerHTML = `
      <div class="keys-table">
        <div class="empty-state">
          <div class="empty-icon">🔑</div>
          <div class="empty-title">No API keys yet</div>
          <div class="empty-desc">Generate a key to start authenticating your services.</div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="keys-table">
      <div class="keys-table-header">
        <div>Name</div>
        <div>Key Prefix</div>
        <div>Type</div>
        <div>Created</div>
        <div></div>
      </div>
      ${keys.map(k => `
        <div class="key-row" id="key-row-${k.id}">
          <div class="key-field">
            <span class="key-field-label">Name</span>
            <div class="key-name">${escHtml(k.name)}</div>
          </div>
          <div class="key-field">
            <span class="key-field-label">Key Prefix</span>
            <div class="key-prefix">${escHtml(k.prefix || '—')}</div>
          </div>
          <div class="key-field">
            <span class="key-field-label">Type</span>
            ${k.revoked
              ? `<span class="type-badge revoked">revoked</span>`
              : `<span class="type-badge ${k.type || 'secret'}">${k.type === 'publishable' ? '○ publishable' : '● secret'}</span>`
            }
          </div>
          <div class="key-field">
            <span class="key-field-label">Created</span>
            <div class="key-date">${fmtDateFull(k.created_at)}</div>
          </div>
          <div class="key-actions">
            ${!k.revoked
              ? `<button class="btn btn-danger btn-xs"
                         onclick="confirmRevokeKey('${projectId}','${k.id}','${escHtml(k.name)}')">Revoke</button>`
              : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── Create Project ──────────────────────────────────────

function openCreateProject() {
  document.getElementById('new-project-name').value = '';
  document.getElementById('new-project-desc').value = '';
  document.getElementById('create-project-error').classList.add('hidden');
  openModal('modal-create-project');
  setTimeout(() => document.getElementById('new-project-name').focus(), 100);
}

async function doCreateProject() {
  const name  = document.getElementById('new-project-name').value.trim();
  const desc  = document.getElementById('new-project-desc').value.trim();
  const errEl = document.getElementById('create-project-error');
  const btn   = document.getElementById('create-project-btn');
  errEl.classList.add('hidden');

  if (!name) { showError(errEl, 'Project name is required.'); return; }

  setBtnLoading(btn, true, 'Creating...');
  const { ok, data } = await api('POST', '/projects', { name, description: desc });
  setBtnLoading(btn, false, 'Create Project');

  if (!ok) { showError(errEl, data.error || 'Failed to create project'); return; }

  closeModal('modal-create-project');
  toast('✓ Project created');
  projects.push({ ...data.project, key_count: 0 });
  await loadDashboard();
  showPage('project', data.project.id);
}

// ─── Create Key ──────────────────────────────────────────

function openCreateKey() {
  document.getElementById('new-key-name').value = '';
  document.getElementById('create-key-error').classList.add('hidden');
  selectKeyType('secret');
  openModal('modal-create-key');
  setTimeout(() => document.getElementById('new-key-name').focus(), 100);
}

function selectKeyType(type) {
  selectedKeyType = type;
  document.getElementById('type-secret').className =
    `type-option ${type === 'secret' ? 'selected secret' : ''}`;
  document.getElementById('type-publishable').className =
    `type-option publishable ${type === 'publishable' ? 'selected' : ''}`;
}

async function doCreateKey() {
  const name  = document.getElementById('new-key-name').value.trim();
  const errEl = document.getElementById('create-key-error');
  const btn   = document.getElementById('create-key-btn');
  errEl.classList.add('hidden');

  setBtnLoading(btn, true, 'Generating...');
  const { ok, data } = await api('POST', `/projects/${currentProjectId}/keys`, {
    name: name || undefined,
    type: selectedKeyType,
  });
  setBtnLoading(btn, false, 'Generate Key');

  if (!ok) { showError(errEl, data.error || 'Failed to generate key'); return; }

  closeModal('modal-create-key');
  document.getElementById('reveal-key-value').textContent = data.api_key;
  openModal('modal-key-reveal');
}

function copyRevealedKey() {
  const val = document.getElementById('reveal-key-value').textContent;
  navigator.clipboard.writeText(val).then(() => toast('⎘ Copied to clipboard'));
}

// ─── Revoke / Delete ─────────────────────────────────────

function confirmRevokeKey(projectId, keyId, keyName) {
  document.getElementById('confirm-title').textContent = 'Revoke API Key';
  document.getElementById('confirm-text').innerHTML =
    `Are you sure you want to revoke <strong>${escHtml(keyName)}</strong>? ` +
    `Any services using this key will immediately lose access.`;
  const btn = document.getElementById('confirm-action-btn');
  btn.textContent = 'Revoke Key';
  btn.onclick = () => doRevokeKey(projectId, keyId);
  openModal('modal-confirm');
}

async function doRevokeKey(projectId, keyId) {
  closeModal('modal-confirm');
  const { ok } = await api('DELETE', `/projects/${projectId}/keys/${keyId}`);
  if (ok) { toast('Key revoked'); loadProject(projectId); }
  else toast('Failed to revoke key');
}

function confirmDeleteProject() {
  const proj = projects.find(p => p.id === currentProjectId);
  document.getElementById('confirm-title').textContent = 'Delete Project';
  document.getElementById('confirm-text').innerHTML =
    `Delete <strong>${proj ? escHtml(proj.name) : 'this project'}</strong>? ` +
    `All API keys will be revoked. This cannot be undone.`;
  const btn = document.getElementById('confirm-action-btn');
  btn.textContent = 'Delete Project';
  btn.onclick = doDeleteProject;
  openModal('modal-confirm');
}

async function doDeleteProject() {
  closeModal('modal-confirm');
  const { ok } = await api('DELETE', `/projects/${currentProjectId}`);
  if (ok) { toast('Project deleted'); showPage('dashboard'); }
  else toast('Failed to delete project');
}