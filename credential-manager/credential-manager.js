// ─────────────────────────────────────────────
//  DB LAYER
// ─────────────────────────────────────────────
const DB_NAME = 'ProjectCredentialDB';
const DB_VER = 2;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('projects')) {
        const ps = d.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
        ps.createIndex('name', 'name');
      }
      if (!d.objectStoreNames.contains('environments')) {
        const es = d.createObjectStore('environments', { keyPath: 'id', autoIncrement: true });
        es.createIndex('projectId', 'projectId');
      }
      if (!d.objectStoreNames.contains('credentials')) {
        const cs = d.createObjectStore('credentials', { keyPath: 'id', autoIncrement: true });
        cs.createIndex('projectId', 'projectId');
        cs.createIndex('environmentId', 'environmentId');
      }
      if (!d.objectStoreNames.contains('github_links')) {
        const gs = d.createObjectStore('github_links', { keyPath: 'id', autoIncrement: true });
        gs.createIndex('projectId', 'projectId');
      }
      if (!d.objectStoreNames.contains('doc_links')) {
        const ds = d.createObjectStore('doc_links', { keyPath: 'id', autoIncrement: true });
        ds.createIndex('projectId', 'projectId');
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(stores, mode = 'readonly') {
  return db.transaction(stores, mode);
}

// Generic CRUD helpers
function dbGetAll(store, indexName, value) {
  return new Promise((resolve, reject) => {
    const t = tx(store);
    const os = t.objectStore(store);
    const req = value !== undefined
      ? os.index(indexName).getAll(value)
      : os.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbAdd(store, obj) {
  return new Promise((resolve, reject) => {
    const t = tx(store, 'readwrite');
    const req = t.objectStore(store).add(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(store, obj) {
  return new Promise((resolve, reject) => {
    const t = tx(store, 'readwrite');
    const req = t.objectStore(store).put(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(store, id) {
  return new Promise((resolve, reject) => {
    const t = tx(store, 'readwrite');
    const req = t.objectStore(store).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Project CRUD
const getProjects = () => dbGetAll('projects');
const addProject = obj => dbAdd('projects', obj);
const updateProject = obj => dbPut('projects', obj);
async function deleteProject(id) {
  await dbDelete('projects', id);
  const envs = await getEnvironments(id);
  for (const e of envs) await dbDelete('environments', e.id);
  const creds = await getCredentials(id);
  for (const c of creds) await dbDelete('credentials', c.id);
  const ghLinks = await getGithubLinks(id);
  for (const g of ghLinks) await dbDelete('github_links', g.id);
  const dLinks = await getDocLinks(id);
  for (const d of dLinks) await dbDelete('doc_links', d.id);
}

// Environment CRUD
const getEnvironments = pid => dbGetAll('environments', 'projectId', pid);
const addEnvironment = obj => dbAdd('environments', obj);
const updateEnvironment = obj => dbPut('environments', obj);
async function deleteEnvironment(id) {
  await dbDelete('environments', id);
  // Unlink credentials
  const all = await dbGetAll('credentials');
  for (const c of all) {
    if (c.environmentId === id) {
      c.environmentId = null;
      await dbPut('credentials', c);
    }
  }
}

// Credential CRUD
const getCredentials = pid => dbGetAll('credentials', 'projectId', pid);
const addCredential = obj => dbAdd('credentials', obj);
const updateCredential = obj => dbPut('credentials', obj);
const deleteCredential = id => dbDelete('credentials', id);

// GitHub Links CRUD
const getGithubLinks = pid => dbGetAll('github_links', 'projectId', pid);
const addGithubLink = obj => dbAdd('github_links', obj);
const updateGithubLink = obj => dbPut('github_links', obj);
const deleteGithubLink = id => dbDelete('github_links', id);

// Doc Links CRUD
const getDocLinks = pid => dbGetAll('doc_links', 'projectId', pid);
const addDocLink = obj => dbAdd('doc_links', obj);
const updateDocLink = obj => dbPut('doc_links', obj);
const deleteDocLink = id => dbDelete('doc_links', id);

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let state = {
  projects: [],
  activeProjectId: null,
  environments: [],
  credentials: [],
  githubLinks: [],
  docLinks: [],
  activeTab: 'environments',
};

// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────
function toast(msg, icon = 'check_circle') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class='material-symbols-outlined' style='font-size:18px; vertical-align:bottom'>${icon}</span> ${msg}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ─────────────────────────────────────────────
//  COPY
// ─────────────────────────────────────────────
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      btn.classList.add('copy-success');
      setTimeout(() => btn.classList.remove('copy-success'), 1200);
    }
    toast('Copied!');
  } catch {
    toast('Copy failed', 'warning');
  }
}

// ─────────────────────────────────────────────
//  MODAL SYSTEM
// ─────────────────────────────────────────────
function showModal(html, onReady) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay); });
  onReady && onReady(overlay);
  return overlay;
}

function closeModal(overlay) {
  overlay.remove();
}

// ─────────────────────────────────────────────
//  SIDEBAR RENDER
// ─────────────────────────────────────────────
function getEnvBadgeClass(name = '') {
  const n = name.toLowerCase();
  if (n === 'local') return 'local';
  if (n === 'dev' || n === 'development') return 'dev';
  if (n === 'stage' || n === 'staging') return 'stage';
  if (n === 'live' || n === 'production' || n === 'prod') return 'live';
  return 'other';
}

async function renderSidebar(filter = '') {
  state.projects = await getProjects();
  const list = document.getElementById('project-list');
  const lf = filter.toLowerCase();
  const filtered = filter
    ? state.projects.filter(p => p.name.toLowerCase().includes(lf))
    : state.projects;

  list.innerHTML = filtered.length === 0
    ? `<div style="padding:16px;color:var(--text-dim);font-size:12px;text-align:center">${filter ? 'No matches' : 'No projects yet'}</div>`
    : filtered.map(p => `
      <div class="project-item ${p.id === state.activeProjectId ? 'active' : ''}" data-id="${p.id}">
        <div class="project-dot"></div>
        <div class="project-name-text">${esc(p.name)}</div>
      </div>
    `).join('');

  list.querySelectorAll('.project-item').forEach(el => {
    el.addEventListener('click', () => selectProject(+el.dataset.id));
  });
}

// ─────────────────────────────────────────────
//  PROJECT SELECTION
// ─────────────────────────────────────────────
async function selectProject(id) {
  state.activeProjectId = id;
  state.environments = await getEnvironments(id);
  state.credentials = await getCredentials(id);
  state.githubLinks = await getGithubLinks(id);
  state.docLinks = await getDocLinks(id);
  await renderSidebar();
  renderProjectView();
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('project-view').style.display = 'flex';
  document.getElementById('project-view').style.flexDirection = 'column';
}

function renderProjectView() {
  const p = state.projects.find(x => x.id === state.activeProjectId);
  if (!p) return;
  document.getElementById('view-project-name').textContent = p.name;
  document.getElementById('view-project-desc').textContent = p.description || '';
  document.getElementById('view-project-date').textContent = new Date(p.createdAt).toLocaleDateString();
  renderEnvTab();
  renderCredTab();
  renderGithubTab();
  renderDocsTab();
}

// ─────────────────────────────────────────────
//  TABS
// ─────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeTab = tab.dataset.tab;
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ─────────────────────────────────────────────
//  ENVIRONMENTS
// ─────────────────────────────────────────────
function renderEnvTab() {
  const grid = document.getElementById('env-grid');
  document.getElementById('env-tab-count').textContent = state.environments.length;

  if (state.environments.length === 0) {
    grid.innerHTML = `<div style="color:var(--text-dim);font-size:13px;padding:20px 0">No environments yet. Add one above.</div>`;
    return;
  }

  grid.innerHTML = state.environments.map(env => `
    <div class="env-card">
      <div class="env-card-header">
        <span class="env-badge ${getEnvBadgeClass(env.name)}">${esc(env.name)}</span>
        <div style="display:flex;gap:4px">
          <button class="icon-btn" onclick="openEditEnv(${env.id})" title="Edit"><span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">edit</span></button>
          <button class="icon-btn danger" onclick="confirmDeleteEnv(${env.id})" title="Delete"><span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">delete</span></button>
        </div>
      </div>
      <div class="env-url">${esc(env.url) || '<span style="color:var(--text-dim)">No URL set</span>'}</div>
      <div class="env-actions">
        ${env.url ? `<button class="btn btn-ghost" style="font-size:12px;padding:5px 10px" onclick="window.open('${esc(env.url)}','_blank')">🔗 Open</button>` : ''}
        ${env.url ? `<button class="btn btn-ghost" style="font-size:12px;padding:5px 10px" onclick="copyText('${esc(env.url)}', this)"><span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">content_copy</span> Copy URL</button>` : ''}
      </div>
    </div>
  `).join('');
}

function openAddEnv() {
  const html = `
    <div class="modal-title">Add Environment</div>
    <div class="form-group">
      <label class="form-label">Environment Name</label>
      <input class="form-input" id="env-name" placeholder="e.g. Local, Dev, Stage, Live" list="env-suggestions">
      <datalist id="env-suggestions">
        <option value="Local"><option value="Dev"><option value="Stage"><option value="Live">
      </datalist>
    </div>
    <div class="form-group">
      <label class="form-label">URL</label>
      <input class="form-input" id="env-url" placeholder="https://example.com" type="url">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-save">Save</button>
    </div>`;

  const overlay = showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-save').onclick = async () => {
      const name = o.querySelector('#env-name').value.trim();
      const url = o.querySelector('#env-url').value.trim();
      if (!name) return toast('Name required', 'warning');
      await addEnvironment({ projectId: state.activeProjectId, name, url });
      state.environments = await getEnvironments(state.activeProjectId);
      renderEnvTab();
      refreshCredEnvFilter();
      closeModal(o);
      toast('Environment added');
    };
    o.querySelector('#env-name').focus();
  });
}

async function openEditEnv(id) {
  const env = state.environments.find(e => e.id === id);
  if (!env) return;

  const html = `
    <div class="modal-title">Edit Environment</div>
    <div class="form-group">
      <label class="form-label">Name</label>
      <input class="form-input" id="env-name" value="${esc(env.name)}" list="env-suggestions2">
      <datalist id="env-suggestions2">
        <option value="Local"><option value="Dev"><option value="Stage"><option value="Live">
      </datalist>
    </div>
    <div class="form-group">
      <label class="form-label">URL</label>
      <input class="form-input" id="env-url" value="${esc(env.url)}" type="url">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-save">Save</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-save').onclick = async () => {
      const name = o.querySelector('#env-name').value.trim();
      const url = o.querySelector('#env-url').value.trim();
      if (!name) return toast('Name required', 'warning');
      await updateEnvironment({ ...env, name, url });
      state.environments = await getEnvironments(state.activeProjectId);
      renderEnvTab();
      refreshCredEnvFilter();
      closeModal(o);
      toast('Environment updated');
    };
  });
}

async function confirmDeleteEnv(id) {
  const env = state.environments.find(e => e.id === id);
  const html = `
    <div class="modal-title">Delete Environment?</div>
    <p style="color:var(--text-muted);margin-bottom:8px">Delete <strong>${esc(env.name)}</strong>? Credentials linked to this environment will be unlinked (not deleted).</p>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-danger" id="m-del">Delete</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-del').onclick = async () => {
      await deleteEnvironment(id);
      state.environments = await getEnvironments(state.activeProjectId);
      state.credentials = await getCredentials(state.activeProjectId);
      renderEnvTab();
      renderCredTab();
      closeModal(o);
      toast('Environment deleted');
    };
  });
}

// ─────────────────────────────────────────────
//  CREDENTIALS
// ─────────────────────────────────────────────
let credSearchVal = '';
let credEnvFilter = '';

function renderCredTab() {
  document.getElementById('cred-tab-count').textContent = state.credentials.length;
  refreshCredEnvFilter();
  renderCredRows();
}

function refreshCredEnvFilter() {
  const sel = document.getElementById('cred-env-filter');
  const prev = sel.value;
  sel.innerHTML = `<option value="">All Environments</option>` +
    state.environments.map(e => `<option value="${e.id}" ${e.id == prev ? 'selected':''}><span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">language</span> ${esc(e.name)}</option>`).join('');
}

function renderCredRows() {
  const tbody = document.getElementById('cred-tbody');
  const empty = document.getElementById('cred-empty');
  const search = credSearchVal.toLowerCase();
  const envId = credEnvFilter ? +credEnvFilter : null;

  let creds = state.credentials;
  if (search) creds = creds.filter(c => c.username.toLowerCase().includes(search));
  if (envId) creds = creds.filter(c => c.environmentId === envId);

  if (creds.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = creds.map(c => {
    const env = state.environments.find(e => e.id === c.environmentId);
    return `
      <tr>
        <td>
          <div class="cred-username">${esc(c.username)}</div>
        </td>
        <td>
          <div class="cred-password">
            <span class="pw-display" data-id="${c.id}" data-visible="0">••••••••</span>
            <button class="icon-btn" onclick="togglePw(${c.id})" title="Show/Hide"><span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">visibility</span></button>
            <button class="icon-btn" onclick="copyCred('${esc(c.password)}', this)" title="Copy password"><span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">content_copy</span></button>
          </div>
        </td>
        <td>
          ${env ? `<span class="env-badge ${getEnvBadgeClass(env.name)}" style="font-size:11px">${esc(env.name)}</span>` : '<span style="color:var(--text-dim)">—</span>'}
        </td>
        <td><div class="cred-notes" title="${esc(c.notes || '')}">${esc(c.notes || '—')}</div></td>
        <td>
          <div class="cred-actions">
            <button class="icon-btn" onclick="copyText('${esc(c.username)}', this)" title="Copy username"><span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">content_copy</span></button>
            <button class="icon-btn" onclick="openEditCred(${c.id})" title="Edit"><span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">edit</span></button>
            <button class="icon-btn danger" onclick="confirmDeleteCred(${c.id})" title="Delete"><span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">delete</span></button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function togglePw(id) {
  const span = document.querySelector(`.pw-display[data-id="${id}"]`);
  if (!span) return;
  const cred = state.credentials.find(c => c.id === id);
  if (!cred) return;
  const visible = span.dataset.visible === '1';
  span.dataset.visible = visible ? '0' : '1';
  span.textContent = visible ? '••••••••' : cred.password;
}

function copyCred(pw, btn) { copyText(pw, btn); }

function openAddCred() {
  const envOpts = state.environments.map(e =>
    `<option value="${e.id}">${esc(e.name)}</option>`).join('');

  const html = `
    <div class="modal-title">Add Credential</div>
    <div class="form-group">
      <label class="form-label">Username / Email</label>
      <input class="form-input" id="cred-user" placeholder="user@example.com">
    </div>
    <div class="form-group">
      <label class="form-label">Password</label>
      <div class="password-wrap">
        <input class="form-input" id="cred-pass" type="password" placeholder="••••••••">
        <button class="password-toggle" type="button" onclick="toggleInputPw('cred-pass', this)"><span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">visibility</span></button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Environment (optional)</label>
      <select class="form-select" id="cred-env">
        <option value="">None</option>${envOpts}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Notes (optional)</label>
      <textarea class="form-textarea" id="cred-notes" placeholder="Any extra info…"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-save">Save</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-save').onclick = async () => {
      const username = o.querySelector('#cred-user').value.trim();
      const password = o.querySelector('#cred-pass').value;
      const envId = o.querySelector('#cred-env').value;
      const notes = o.querySelector('#cred-notes').value.trim();
      if (!username) return toast('Username required', 'warning');
      await addCredential({
        projectId: state.activeProjectId,
        username, password,
        environmentId: envId ? +envId : null,
        notes
      });
      state.credentials = await getCredentials(state.activeProjectId);
      renderCredTab();
      closeModal(o);
      toast('Credential added');
    };
    o.querySelector('#cred-user').focus();
  });
}

async function openEditCred(id) {
  const cred = state.credentials.find(c => c.id === id);
  if (!cred) return;
  const envOpts = state.environments.map(e =>
    `<option value="${e.id}" ${e.id === cred.environmentId ? 'selected':''}>${esc(e.name)}</option>`).join('');

  const html = `
    <div class="modal-title">Edit Credential</div>
    <div class="form-group">
      <label class="form-label">Username / Email</label>
      <input class="form-input" id="cred-user" value="${esc(cred.username)}">
    </div>
    <div class="form-group">
      <label class="form-label">Password</label>
      <div class="password-wrap">
        <input class="form-input" id="cred-pass" type="password" value="${esc(cred.password)}">
        <button class="password-toggle" type="button" onclick="toggleInputPw('cred-pass', this)"><span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">visibility</span></button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Environment</label>
      <select class="form-select" id="cred-env">
        <option value="">None</option>${envOpts}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea class="form-textarea" id="cred-notes">${esc(cred.notes || '')}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-save">Save</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-save').onclick = async () => {
      const username = o.querySelector('#cred-user').value.trim();
      const password = o.querySelector('#cred-pass').value;
      const envId = o.querySelector('#cred-env').value;
      const notes = o.querySelector('#cred-notes').value.trim();
      if (!username) return toast('Username required', 'warning');
      await updateCredential({ ...cred, username, password, environmentId: envId ? +envId : null, notes });
      state.credentials = await getCredentials(state.activeProjectId);
      renderCredTab();
      closeModal(o);
      toast('Credential updated');
    };
  });
}

async function confirmDeleteCred(id) {
  const cred = state.credentials.find(c => c.id === id);
  const html = `
    <div class="modal-title">Delete Credential?</div>
    <p style="color:var(--text-muted);margin-bottom:8px">Remove <strong>${esc(cred.username)}</strong>? This cannot be undone.</p>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-danger" id="m-del">Delete</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-del').onclick = async () => {
      await deleteCredential(id);
      state.credentials = await getCredentials(state.activeProjectId);
      renderCredTab();
      closeModal(o);
      toast('Credential deleted');
    };
  });
}

function toggleInputPw(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">visibility</span>' : '<span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">visibility_off</span>';
}

// ─────────────────────────────────────────────
//  PROJECT CRUD
// ─────────────────────────────────────────────
function openAddProject() {
  const html = `
    <div class="modal-title">New Project</div>
    <div class="form-group">
      <label class="form-label">Project Name</label>
      <input class="form-input" id="proj-name" placeholder="My Awesome App">
    </div>
    <div class="form-group">
      <label class="form-label">Description (optional)</label>
      <textarea class="form-textarea" id="proj-desc" placeholder="What is this project about?"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-save">Create Project</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-save').onclick = async () => {
      const name = o.querySelector('#proj-name').value.trim();
      const description = o.querySelector('#proj-desc').value.trim();
      if (!name) return toast('Name required', 'warning');
      const id = await addProject({ name, description, createdAt: Date.now() });
      await renderSidebar();
      closeModal(o);
      toast('Project created <span class=\"material-symbols-outlined\">celebration</span>');
      selectProject(id);
    };
    o.querySelector('#proj-name').focus();
  });
}

async function openEditProject() {
  const p = state.projects.find(x => x.id === state.activeProjectId);
  if (!p) return;

  const html = `
    <div class="modal-title">Edit Project</div>
    <div class="form-group">
      <label class="form-label">Name</label>
      <input class="form-input" id="proj-name" value="${esc(p.name)}">
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea class="form-textarea" id="proj-desc">${esc(p.description || '')}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-save">Save</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-save').onclick = async () => {
      const name = o.querySelector('#proj-name').value.trim();
      const description = o.querySelector('#proj-desc').value.trim();
      if (!name) return toast('Name required', 'warning');
      await updateProject({ ...p, name, description });
      state.projects = await getProjects();
      await renderSidebar();
      renderProjectView();
      closeModal(o);
      toast('Project updated');
    };
  });
}

async function confirmDeleteProject() {
  const p = state.projects.find(x => x.id === state.activeProjectId);
  const html = `
    <div class="modal-title">Delete Project?</div>
    <p style="color:var(--text-muted);margin-bottom:8px">
      Delete <strong>${esc(p.name)}</strong> and all its environments and credentials? This cannot be undone.
    </p>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-danger" id="m-del">Delete Project</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-del').onclick = async () => {
      await deleteProject(state.activeProjectId);
      state.activeProjectId = null;
      state.environments = [];
      state.credentials = [];
      await renderSidebar();
      document.getElementById('project-view').style.display = 'none';
      document.getElementById('empty-state').style.display = 'flex';
      closeModal(o);
      toast('Project deleted');
    };
  });
}

// ─────────────────────────────────────────────
//  GITHUB LINKS
// ─────────────────────────────────────────────
const REPO_TYPE_META = {
  github:    { label: 'GitHub',    icon: 'code',           color: '#24292f', bg: 'rgba(36,41,47,0.08)' },
  gitlab:    { label: 'GitLab',    icon: 'source',         color: '#e24329', bg: 'rgba(226,67,41,0.1)'  },
  bitbucket: { label: 'Bitbucket', icon: 'account_tree',   color: '#0052cc', bg: 'rgba(0,82,204,0.1)'   },
  other:     { label: 'Other',     icon: 'link',           color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

function getRepoType(url = '') {
  if (url.includes('github.com'))    return 'github';
  if (url.includes('gitlab.com'))    return 'gitlab';
  if (url.includes('bitbucket.org')) return 'bitbucket';
  return 'other';
}

function renderGithubTab() {
  const count = state.githubLinks.length;
  document.getElementById('github-tab-count').textContent = count;
  const grid = document.getElementById('github-grid');

  if (count === 0) {
    grid.innerHTML = `<div class="links-empty">No repositories yet. Add one above.</div>`;
    return;
  }

  grid.innerHTML = state.githubLinks.map(g => {
    const type = getRepoType(g.url);
    const meta = REPO_TYPE_META[type];
    return `
      <div class="link-card">
        <div class="link-card-header">
          <div class="link-type-badge" style="background:${meta.bg};color:${meta.color}">
            <span class="material-symbols-outlined" style="font-size:12px;vertical-align:text-bottom">${meta.icon}</span>
            ${meta.label}
          </div>
          <div style="display:flex;gap:4px">
            <button class="icon-btn" onclick="openEditGithub(${g.id})" title="Edit"><span class="material-symbols-outlined" style="font-size:inherit;vertical-align:text-bottom">edit</span></button>
            <button class="icon-btn danger" onclick="confirmDeleteGithub(${g.id})" title="Delete"><span class="material-symbols-outlined" style="font-size:inherit;vertical-align:text-bottom">delete</span></button>
          </div>
        </div>
        <div class="link-card-title">${esc(g.name)}</div>
        ${g.description ? `<div class="link-card-desc">${esc(g.description)}</div>` : ''}
        <div class="link-card-url">${esc(g.url)}</div>
        ${g.branch ? `<div class="link-card-branch"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:text-bottom">alt_route</span> ${esc(g.branch)}</div>` : ''}
        <div class="link-card-actions">
          <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px" onclick="window.open('${esc(g.url)}','_blank')">🔗 Open</button>
          <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px" onclick="copyText('${esc(g.url)}',this)"><span class="material-symbols-outlined" style="font-size:inherit;vertical-align:text-bottom">content_copy</span> Copy URL</button>
        </div>
      </div>`;
  }).join('');
}

function openAddGithub() {
  const html = `
    <div class="modal-title">Add Repository</div>
    <div class="form-group">
      <label class="form-label">Repo Name / Label</label>
      <input class="form-input" id="gh-name" placeholder="e.g. frontend, api-service">
    </div>
    <div class="form-group">
      <label class="form-label">Repository URL</label>
      <input class="form-input" id="gh-url" type="url" placeholder="https://github.com/org/repo">
    </div>
    <div class="form-group">
      <label class="form-label">Default Branch (optional)</label>
      <input class="form-input" id="gh-branch" placeholder="main">
    </div>
    <div class="form-group">
      <label class="form-label">Description (optional)</label>
      <textarea class="form-textarea" id="gh-desc" placeholder="What does this repo contain?"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-save">Save</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-save').onclick = async () => {
      const name = o.querySelector('#gh-name').value.trim();
      const url  = o.querySelector('#gh-url').value.trim();
      const branch = o.querySelector('#gh-branch').value.trim();
      const description = o.querySelector('#gh-desc').value.trim();
      if (!name) return toast('Name required', 'warning');
      if (!url)  return toast('URL required', 'warning');
      await addGithubLink({ projectId: state.activeProjectId, name, url, branch, description });
      state.githubLinks = await getGithubLinks(state.activeProjectId);
      renderGithubTab();
      closeModal(o);
      toast('Repository added');
    };
    o.querySelector('#gh-name').focus();
  });
}

async function openEditGithub(id) {
  const g = state.githubLinks.find(x => x.id === id);
  if (!g) return;
  const html = `
    <div class="modal-title">Edit Repository</div>
    <div class="form-group">
      <label class="form-label">Repo Name / Label</label>
      <input class="form-input" id="gh-name" value="${esc(g.name)}">
    </div>
    <div class="form-group">
      <label class="form-label">Repository URL</label>
      <input class="form-input" id="gh-url" type="url" value="${esc(g.url)}">
    </div>
    <div class="form-group">
      <label class="form-label">Default Branch</label>
      <input class="form-input" id="gh-branch" value="${esc(g.branch || '')}">
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea class="form-textarea" id="gh-desc">${esc(g.description || '')}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-save">Save</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-save').onclick = async () => {
      const name = o.querySelector('#gh-name').value.trim();
      const url  = o.querySelector('#gh-url').value.trim();
      const branch = o.querySelector('#gh-branch').value.trim();
      const description = o.querySelector('#gh-desc').value.trim();
      if (!name) return toast('Name required', 'warning');
      if (!url)  return toast('URL required', 'warning');
      await updateGithubLink({ ...g, name, url, branch, description });
      state.githubLinks = await getGithubLinks(state.activeProjectId);
      renderGithubTab();
      closeModal(o);
      toast('Repository updated');
    };
  });
}

async function confirmDeleteGithub(id) {
  const g = state.githubLinks.find(x => x.id === id);
  const html = `
    <div class="modal-title">Delete Repository?</div>
    <p style="color:var(--text-muted);margin-bottom:8px">Remove <strong>${esc(g.name)}</strong>? This cannot be undone.</p>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-danger" id="m-del">Delete</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-del').onclick = async () => {
      await deleteGithubLink(id);
      state.githubLinks = await getGithubLinks(state.activeProjectId);
      renderGithubTab();
      closeModal(o);
      toast('Repository removed');
    };
  });
}

// ─────────────────────────────────────────────
//  DOC LINKS
// ─────────────────────────────────────────────
const DOC_TYPE_META = {
  'google-sheets': { label: 'Google Sheets',   icon: 'table_chart',    color: '#0f9d58', bg: 'rgba(15,157,88,0.1)'   },
  'google-docs':   { label: 'Google Docs',     icon: 'description',    color: '#4285f4', bg: 'rgba(66,133,244,0.1)'  },
  'google-slides': { label: 'Google Slides',   icon: 'slideshow',      color: '#f4b400', bg: 'rgba(244,180,0,0.12)'  },
  'notion':        { label: 'Notion',          icon: 'article',        color: '#37352f', bg: 'rgba(55,53,47,0.08)'   },
  'confluence':    { label: 'Confluence',      icon: 'hub',            color: '#0052cc', bg: 'rgba(0,82,204,0.1)'    },
  'figma':         { label: 'Figma',           icon: 'palette',        color: '#f24e1e', bg: 'rgba(242,78,30,0.1)'   },
  'airtable':      { label: 'Airtable',        icon: 'grid_on',        color: '#18bfff', bg: 'rgba(24,191,255,0.1)'  },
  'other':         { label: 'Doc',             icon: 'insert_link',    color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
};

function getDocType(url = '') {
  if (url.includes('docs.google.com/spreadsheets')) return 'google-sheets';
  if (url.includes('docs.google.com/document'))     return 'google-docs';
  if (url.includes('docs.google.com/presentation')) return 'google-slides';
  if (url.includes('notion.so') || url.includes('notion.site')) return 'notion';
  if (url.includes('confluence'))  return 'confluence';
  if (url.includes('figma.com'))   return 'figma';
  if (url.includes('airtable.com')) return 'airtable';
  return 'other';
}

function renderDocsTab() {
  const count = state.docLinks.length;
  document.getElementById('docs-tab-count').textContent = count;
  const grid = document.getElementById('docs-grid');

  if (count === 0) {
    grid.innerHTML = `<div class="links-empty">No documents yet. Add one above.</div>`;
    return;
  }

  grid.innerHTML = state.docLinks.map(d => {
    const type = getDocType(d.url);
    const meta = DOC_TYPE_META[type];
    return `
      <div class="link-card">
        <div class="link-card-header">
          <div class="link-type-badge" style="background:${meta.bg};color:${meta.color}">
            <span class="material-symbols-outlined" style="font-size:12px;vertical-align:text-bottom">${meta.icon}</span>
            ${meta.label}
          </div>
          <div style="display:flex;gap:4px">
            <button class="icon-btn" onclick="openEditDoc(${d.id})" title="Edit"><span class="material-symbols-outlined" style="font-size:inherit;vertical-align:text-bottom">edit</span></button>
            <button class="icon-btn danger" onclick="confirmDeleteDoc(${d.id})" title="Delete"><span class="material-symbols-outlined" style="font-size:inherit;vertical-align:text-bottom">delete</span></button>
          </div>
        </div>
        <div class="link-card-title">${esc(d.name)}</div>
        ${d.description ? `<div class="link-card-desc">${esc(d.description)}</div>` : ''}
        <div class="link-card-url">${esc(d.url)}</div>
        <div class="link-card-actions">
          <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px" onclick="window.open('${esc(d.url)}','_blank')">🔗 Open</button>
          <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px" onclick="copyText('${esc(d.url)}',this)"><span class="material-symbols-outlined" style="font-size:inherit;vertical-align:text-bottom">content_copy</span> Copy URL</button>
        </div>
      </div>`;
  }).join('');
}

function openAddDoc() {
  const typeOpts = Object.entries(DOC_TYPE_META).map(([k, v]) =>
    `<option value="${k}">${v.label}</option>`).join('');

  const html = `
    <div class="modal-title">Add Document Link</div>
    <div class="form-group">
      <label class="form-label">Document Name</label>
      <input class="form-input" id="doc-name" placeholder="e.g. Sprint Board, Design Spec">
    </div>
    <div class="form-group">
      <label class="form-label">URL</label>
      <input class="form-input" id="doc-url" type="url" placeholder="https://docs.google.com/…">
    </div>
    <div class="form-group">
      <label class="form-label">Description (optional)</label>
      <textarea class="form-textarea" id="doc-desc" placeholder="What is this document for?"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-save">Save</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-save').onclick = async () => {
      const name = o.querySelector('#doc-name').value.trim();
      const url  = o.querySelector('#doc-url').value.trim();
      const description = o.querySelector('#doc-desc').value.trim();
      if (!name) return toast('Name required', 'warning');
      if (!url)  return toast('URL required', 'warning');
      await addDocLink({ projectId: state.activeProjectId, name, url, description });
      state.docLinks = await getDocLinks(state.activeProjectId);
      renderDocsTab();
      closeModal(o);
      toast('Document added');
    };
    o.querySelector('#doc-name').focus();
  });
}

async function openEditDoc(id) {
  const d = state.docLinks.find(x => x.id === id);
  if (!d) return;
  const html = `
    <div class="modal-title">Edit Document Link</div>
    <div class="form-group">
      <label class="form-label">Document Name</label>
      <input class="form-input" id="doc-name" value="${esc(d.name)}">
    </div>
    <div class="form-group">
      <label class="form-label">URL</label>
      <input class="form-input" id="doc-url" type="url" value="${esc(d.url)}">
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea class="form-textarea" id="doc-desc">${esc(d.description || '')}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-primary" id="m-save">Save</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-save').onclick = async () => {
      const name = o.querySelector('#doc-name').value.trim();
      const url  = o.querySelector('#doc-url').value.trim();
      const description = o.querySelector('#doc-desc').value.trim();
      if (!name) return toast('Name required', 'warning');
      if (!url)  return toast('URL required', 'warning');
      await updateDocLink({ ...d, name, url, description });
      state.docLinks = await getDocLinks(state.activeProjectId);
      renderDocsTab();
      closeModal(o);
      toast('Document updated');
    };
  });
}

async function confirmDeleteDoc(id) {
  const d = state.docLinks.find(x => x.id === id);
  const html = `
    <div class="modal-title">Delete Document?</div>
    <p style="color:var(--text-muted);margin-bottom:8px">Remove <strong>${esc(d.name)}</strong>? This cannot be undone.</p>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="m-cancel">Cancel</button>
      <button class="btn btn-danger" id="m-del">Delete</button>
    </div>`;

  showModal(html, o => {
    o.querySelector('#m-cancel').onclick = () => closeModal(o);
    o.querySelector('#m-del').onclick = async () => {
      await deleteDocLink(id);
      state.docLinks = await getDocLinks(state.activeProjectId);
      renderDocsTab();
      closeModal(o);
      toast('Document removed');
    };
  });
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
async function exportData() {
  const projects = await getProjects();
  const all = { projects: [], environments: [], credentials: [], github_links: [], doc_links: [] };
  all.projects = projects;
  for (const p of projects) {
    const envs  = await getEnvironments(p.id);
    const creds = await getCredentials(p.id);
    const ghs   = await getGithubLinks(p.id);
    const docs  = await getDocLinks(p.id);
    all.environments.push(...envs);
    all.credentials.push(...creds);
    all.github_links.push(...ghs);
    all.doc_links.push(...docs);
  }
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vaultgrid-export-${Date.now()}.json`;
  a.click();
  toast('Export complete <span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">upload</span>');
}

async function importData(json) {
  try {
    const data = JSON.parse(json);
    // Re-map IDs to avoid conflicts
    const pidMap = {};
    const eidMap = {};

    for (const p of (data.projects || [])) {
      const oldId = p.id;
      delete p.id;
      const newId = await addProject(p);
      pidMap[oldId] = newId;
    }
    for (const e of (data.environments || [])) {
      const oldId = e.id;
      e.projectId = pidMap[e.projectId];
      if (!e.projectId) continue;
      delete e.id;
      const newId = await addEnvironment(e);
      eidMap[oldId] = newId;
    }
    for (const c of (data.credentials || [])) {
      c.projectId = pidMap[c.projectId];
      if (!c.projectId) continue;
      if (c.environmentId) c.environmentId = eidMap[c.environmentId] || null;
      delete c.id;
      await addCredential(c);
    }
    for (const g of (data.github_links || [])) {
      g.projectId = pidMap[g.projectId];
      if (!g.projectId) continue;
      delete g.id;
      await addGithubLink(g);
    }
    for (const d of (data.doc_links || [])) {
      d.projectId = pidMap[d.projectId];
      if (!d.projectId) continue;
      delete d.id;
      await addDocLink(d);
    }
    await renderSidebar();
    toast('Import complete <span class="material-symbols-outlined" style="font-size:inherit; vertical-align:text-bottom">download</span>');
  } catch (err) {
    toast('Import failed: ' + err.message, 'error');
  }
}

// ─────────────────────────────────────────────
//  GLOBAL SEARCH
// ─────────────────────────────────────────────
document.getElementById('global-search').addEventListener('input', e => {
  renderSidebar(e.target.value);
});

// ─────────────────────────────────────────────
//  WIRE UP BUTTONS
// ─────────────────────────────────────────────
document.getElementById('add-project-btn').addEventListener('click', openAddProject);
document.getElementById('empty-add-btn').addEventListener('click', openAddProject);
document.getElementById('edit-project-btn').addEventListener('click', openEditProject);
document.getElementById('delete-project-btn').addEventListener('click', confirmDeleteProject);
document.getElementById('add-env-btn').addEventListener('click', openAddEnv);
document.getElementById('add-cred-btn').addEventListener('click', openAddCred);
document.getElementById('add-github-btn').addEventListener('click', openAddGithub);
document.getElementById('add-doc-btn').addEventListener('click', openAddDoc);

document.getElementById('cred-search').addEventListener('input', e => {
  credSearchVal = e.target.value;
  renderCredRows();
});

document.getElementById('cred-env-filter').addEventListener('change', e => {
  credEnvFilter = e.target.value;
  renderCredRows();
});

document.getElementById('export-btn').addEventListener('click', exportData);
document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => importData(ev.target.result);
  reader.readAsText(file);
  e.target.value = '';
});

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
openDB().then(async () => {
  await renderSidebar();
  // Auto-select first project
  const ps = await getProjects();
  if (ps.length > 0) selectProject(ps[0].id);
}).catch(err => {
  document.body.innerHTML = `<div style="padding:40px;color:#f87171;font-family:monospace">IndexedDB error: ${err.message}</div>`;
});