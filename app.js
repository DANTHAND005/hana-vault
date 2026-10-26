'use strict';

/* ==========================================================================
   HANA vault prototype
   1. Model: data, templates, search index (no DOM work; checks/ load this part alone)
   2. Storage: IndexedDB for imported originals
   3. Rendering: sidebar, inspector, library, recent files
   4. Map: projected 3D graph on canvas with DOM buttons for nodes
   5. Actions: dialogs, import, preview, connections
   6. Events
   ========================================================================== */

/* ---------- 1. Model ---------- */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = value =>
  String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const paths = {
  vault: 'M3 5h18v15H3z M7 5V3h10v2 M3 10h18 M10 10v4h4v-4',
  clock: 'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  inbox: 'M4 4h16l2 13v3H2v-3L4 4z M2 14h6l2 3h4l2-3h6',
  bookmark: 'M6 3h12v18l-6-4-6 4V3z',
  plus: 'M12 5v14 M5 12h14',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3',
  minus: 'M5 12h14',
  upload: 'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',
  search: 'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  map: 'M4 7l7-4 9 4v12l-9 2-7-4V7z M11 3v18 M4 7l7 4 9-4',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  panel: 'M3 4h18v16H3z M15 4v16',
  info: 'M12 11v6 M12 7h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  arrow: 'M5 12h14 M14 7l5 5-5 5',
  close: 'M6 6l12 12 M18 6L6 18',
  focus: 'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6 M8 12h8 M12 8v8',
  folder: 'M3 6V4h6l2 3h10v13H3V6z',
  document: 'M5 3h9l5 5v13H5V3z M14 3v6h5 M8 13h8 M8 17h6',
  image: 'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M15 7h.01',
  data: 'M3 4h18v16H3z M3 9h18 M8 4v16 M15 4v16 M3 14h18',
  branch: 'M6 3v12a3 3 0 0 0 3 3h9 M6 9h7a3 3 0 0 0 3-3V3 M3 3h6 M13 3h6 M18 15v6',
  link: 'M9 15l6-6 M8 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 7l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  download: 'M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  rotate: 'M3 10a9 9 0 1 1 2 9 M3 4v6h6',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13 7l4 4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6'
};
const icon = name =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.folder}"/></svg>`;
function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach(el => { el.innerHTML = icon(el.dataset.icon); });
}

const colors = ['#b9d5a7', '#c2b8df', '#dbbc8d', '#95c7c2', '#b7c6e0', '#d4a9a1', '#c9cb99'];
const colorNames = ['Sage', 'Lavender', 'Sand', 'Sea glass', 'Slate', 'Rose', 'Olive'];
const templates = {
  investment: ['Strategy & mandate', 'Deal pipeline', 'Due diligence', 'Investment committee', 'Portfolio', 'Markets & research', 'Fund operations'],
  analyst: ['Coverage', 'Research questions', 'Sources & data', 'Models & assumptions', 'Findings', 'Reports', 'Monitoring'],
  management: ['Strategy & goals', 'Teams', 'Projects & delivery', 'Performance', 'Finance & resources', 'Decisions & risks', 'Meetings'],
  partners: ['Overview & contacts', 'Shared documents', 'Deliverables', 'Requests & approvals', 'Milestones', 'Meetings', 'Agreements']
};
const templateLabels = { investment: 'Investment team', analyst: 'Analyst team', management: 'Management team', partners: 'Partner workspace' };
const sectionTitles = { recent: 'Recent files', inbox: 'Inbox', starred: 'Saved files' };

const STORAGE_KEY = 'hana-vault-design-v1';
// Opening the page with ?reset clears every imported file and the saved layout once, then returns to the normal address.
const wantsReset = typeof location !== 'undefined' && /[?&]reset\b/.test(location.search);
const PAGE_SIZE = 48;
const COMPACT_WIDTH = 1000;
const HOME_CAMERA = { yaw: 0, tilt: 0.8, zoom: 1 };

// Skill-tree layout, in world units. Radii are measured from the hub; the tree is stretched sideways on wide screens.
const SPIRAL = 28, SPIRAL_INNER = 70;

let stored;
if (wantsReset) { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } }
try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { stored = null; }

// Vaults: the four starter vaults plus any the user adds. Names are editable.
let vaults = Object.entries(templateLabels).map(([id, name]) => ({ id, name }));
if (Array.isArray(stored?.vaults)) {
  vaults = vaults.map(v => ({ ...v, name: stored.vaults.find(s => s.id === v.id)?.name || v.name }));
  stored.vaults.filter(s => s.id && s.name && !templates[s.id]).forEach(s => vaults.push({ id: s.id, name: s.name }));
}
const vaultName = (id = team) => vaults.find(v => v.id === id)?.name || 'Vault';
let nodes = Array.isArray(stored?.nodes) && stored.nodes.every(n => typeof n.id === 'string' && typeof n.name === 'string' && vaults.some(v => v.id === n.team)) ? stored.nodes : [];
let team = vaults.some(v => v.id === stored?.team) ? stored.team : 'investment';
let starred = new Set(Array.isArray(stored?.starred) ? stored.starred : []);

// What the user is looking at.
let view = 'map', nav = 'all', selectedNode = null, selectedFile = null;
let typeFilter = 'all', query = '', sortMode = 'recent', libraryLayout = 'grid', page = 0;
let inspectorOpen = false;

// Imports and caches.
let imports = [], sourceIds = new Set(), pendingRoute = null, importTarget = null, chosenColor = colors[0];
let dataRevision = 0, vaultIndex = null, storageWarning = false;
let currentPreview = null, previewURL = null;
const thumbnailURLs = new Map();
let thumbnailObserver, thumbnailQueue = Promise.resolve(), renderGeneration = 0;

// Map camera.
let yaw = HOME_CAMERA.yaw, tilt = HOME_CAMERA.tilt, zoom = HOME_CAMERA.zoom, drag = null, dragging = false;
const ctx = $('#map-canvas').getContext('2d');
let positions = new Map();

function ensureTemplate(key) {
  if (!templates[key] || nodes.some(n => n.team === key)) return;
  templates[key].forEach((name, i) => nodes.push({ id: `${key}-${i}`, name, color: colors[i], parent: null, team: key }));
}
Object.keys(templates).forEach(ensureTemplate);

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, team, vaults, starred: [...starred] }));
  } catch {
    if (!storageWarning) { toast('Layout could not be saved. Changes may be lost on reload.'); storageWarning = true; }
  }
}

// Resolves files, ancestors, counts and searchable text once per data revision.
function indexVault() {
  const key = `${team}:${nodes.length}:${imports.length}:${dataRevision}`;
  if (vaultIndex?.key === key) return vaultIndex;

  const currentNodes = teamNodes();
  const nodeMap = new Map(currentNodes.map(n => [n.id, n]));
  const files = imports.filter(f => f.team === team);
  const byNode = new Map(currentNodes.map(n => [n.id, []]));
  const searchText = new Map();

  for (const file of files) {
    const ancestors = new Set();
    for (const linked of file.nodeIds) {
      let id = linked;
      while (id && !ancestors.has(id)) { ancestors.add(id); id = nodeMap.get(id)?.parent; }
    }
    for (const id of ancestors) byNode.get(id)?.push(file);
    searchText.set(file.id, `${file.name} ${[...ancestors].map(id => nodeMap.get(id)?.name || '').join(' ')}`.toLowerCase());
  }
  vaultIndex = { key, files, nodeMap, byNode, searchText, fileMap: new Map(files.map(f => [f.id, f])) };
  return vaultIndex;
}
function teamNodes() { return nodes.filter(n => n.team === team); }
function allFiles() { return indexVault().files; }
function filesForNode(id) { return indexVault().byNode.get(id) || []; }
function fileById(id) { return indexVault().fileMap.get(id); }
function nodeById(id) { return indexVault().nodeMap.get(id); }

function filteredFiles() {
  const index = indexVault();
  const scope = selectedNode ? filesForNode(selectedNode) : index.files;
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const sorters = {
    name: byName,
    type: (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
    recent: (a, b) => b.created - a.created
  };
  return scope
    .filter(f => {
      if (nav === 'inbox' && f.nodeIds.length) return false;
      if (nav === 'starred' && !starred.has(f.id)) return false;
      if (typeFilter !== 'all' && f.type !== typeFilter) return false;
      return !query || index.searchText.get(f.id).includes(query);
    })
    .sort(sorters[sortMode] || sorters.recent);
}
function pageFiles(files) { return files.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE); }


// Lays items around a centre in a sunflower spiral on the floor plane (x, z), lifted into a dome (y) so the cluster has real depth.
// Each item hangs off the nearest node placed before it, which gives the branching look.
function spiral(centerId, items, cx, cz) {
  const k = (SPIRAL_INNER / SPIRAL) ** 2, reach = SPIRAL * Math.sqrt(items.length + k + 1);
  const lift = r => Math.sqrt(Math.max(0, reach * reach - r * r)) * 0.5;
  const placed = [{ id: centerId, x: cx, y: -lift(0), z: cz }], points = [], edges = [];
  items.forEach((item, i) => {
    const r = SPIRAL * Math.sqrt(i + k + 0.5), a = i * 2.39996;
    const p = { ...item, x: cx + Math.cos(a) * r, y: -lift(r), z: cz + Math.sin(a) * r };
    const near = placed.reduce((best, q) => (dist3(q, p) < dist3(best, p) ? q : best));
    points.push(p);
    placed.push(p);
    edges.push([near.id, item.id]);
  });
  return { points, edges, reach, top: lift(0) };
}
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function bytes(size) {
  return size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;
}
function fileMeta(f) { return `${bytes(f.size)} · Stored locally`; }
function typeLabel(f) { return f.type === 'image' ? 'Image' : f.type === 'document' ? 'Document' : 'Data'; }
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

let toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4500);
}

/* ---------- 2. Storage ---------- */

const database = new Promise((resolve, reject) => {
  const openDatabase = () => {
  const request = indexedDB.open('hana-vault-design', 2);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
    const meta = db.createObjectStore('metadata', { keyPath: 'id' });
    // Keep existing originals in place while creating a lightweight metadata index.
    const cursor = request.transaction.objectStore('files').openCursor();
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (item) { meta.put(metadata(item.value)); item.continue(); }
    };
  };
  request.onblocked = () => toast('Close another HANA preview tab to finish upgrading local storage.');
  request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  request.onerror = () => reject(request.error);
  };
  if (!wantsReset) { openDatabase(); return; }
  const wipe = indexedDB.deleteDatabase('hana-vault-design');
  wipe.onsuccess = wipe.onerror = wipe.onblocked = () => { history.replaceState(null, '', location.pathname); openDatabase(); };
});
database.catch(() => toast('File storage is unavailable. Imports are disabled in this browser.'));

const metadata = ({ blob, ...rest }) => rest;
const promisify = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

async function dbWrite(record) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['files', 'metadata'], 'readwrite');
    tx.objectStore('files').put(record);
    tx.objectStore('metadata').put(metadata(record));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
  });
}
async function dbDelete(id) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['files', 'metadata'], 'readwrite');
    tx.objectStore('files').delete(id);
    tx.objectStore('metadata').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Could not delete the file'));
  });
}
// Removes a file everywhere it is referenced: storage, saved list, sources and the current answer.
async function deleteFile(id) {
  await dbDelete(id);
  imports = imports.filter(f => f.id !== id);
  starred.delete(id); sourceIds.delete(id);
  if (selectedFile === id) selectedFile = null;
  if (ask) ask.ids.delete(id);
  dataRevision++; save(); render();
}
// Saves edited text back into the stored file.
async function saveFileText(id, text) {
  const record = await dbRead(id);
  record.blob = new Blob([text], { type: record.blob.type || 'text/plain' });
  record.size = record.blob.size;
  await dbWrite(record);
  imports = imports.map(f => f.id === id ? { ...f, size: record.size } : f);
  dataRevision++; render();
}
async function dbRead(id) {
  const db = await database;
  return promisify(db.transaction('files', 'readonly').objectStore('files').get(id));
}
async function loadImports() {
  try {
    const db = await database;
    imports = (await promisify(db.transaction('metadata', 'readonly').objectStore('metadata').getAll())).map(metadata);
    render();
  } catch { /* The database handler already told the user. */ }
}

/* ---------- 3. Rendering ---------- */

function renderNavigation() {
  $('#node-navigation').innerHTML = teamNodes().filter(n => !n.parent).map(n =>
    `<button class="node-nav ${selectedNode === n.id ? 'selected' : ''}" data-node="${escapeHTML(n.id)}" style="--node-color:${n.color}"><span class="node-dot"></span><span>${escapeHTML(n.name)}</span><small>${filesForNode(n.id).length}</small></button>`
  ).join('');
  $('#nav-count').textContent = allFiles().length;
  $('#inbox-count').textContent = allFiles().filter(f => !f.nodeIds.length).length || '';
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === nav && !selectedNode));
  $('#team').innerHTML = vaults.map(v => `<option value="${escapeHTML(v.id)}">${escapeHTML(v.name)}</option>`).join('') + '<option value="__new">+ New vault…</option>';
  $('#team').value = team;
  $('.team-avatar').textContent = vaultName().trim()[0]?.toUpperCase() || 'H';
  $('.nav-item[data-nav="all"] .nav-label').textContent = vaultName();
}

function renderHeading(files) {
  const node = nodeById(selectedNode);
  $('#page-title').textContent = node?.name || (nav === 'all' ? vaultName() : sectionTitles[nav]);
  let description;
  if (node) description = `${plural(filesForNode(node.id).length, 'file')} · ${plural(teamNodes().filter(c => c.parent === node.id).length, 'child node')}`;
  else if (nav === 'all') description = `${plural(allFiles().length, 'file')} across ${plural(teamNodes().filter(n => !n.parent).length, 'node')}`;
  else description = plural(files.length, 'file');
  $('#page-description').textContent = description;
}

const fileMini = f =>
  `<button class="mini-file" data-file="${escapeHTML(f.id)}"><span class="mini-icon">${icon(f.type)}</span><span><strong>${escapeHTML(f.name)}</strong><small>${fileMeta(f)}</small></span></button>`;

function renderInspector() {
  const el = $('#inspector'), n = nodeById(selectedNode), f = fileById(selectedFile);
  const top = `<div class="inspector-top"><span>${f ? 'FILE' : n ? 'NODE' : 'OVERVIEW'}</span><button id="close-inspector" class="icon-button" aria-label="Close details">${icon('close')}</button></div>`;
  let body;

  if (f) {
    const connections = f.nodeIds.length
      ? f.nodeIds.map(id => `<button class="node-child-row" data-node="${escapeHTML(id)}">${icon('folder')}${escapeHTML(nodeById(id)?.name || 'Unknown node')}</button>`).join('')
      : '<p>In the inbox. Not connected to a node yet.</p>';
    body = `<div class="inspector-hero"><div class="inspector-symbol">${icon(f.type)}</div><h2>${escapeHTML(f.name)}</h2><p>${fileMeta(f)}</p></div>
      <h3>CONNECTED TO</h3>${connections}
      <div class="inspector-file-actions"><button class="button secondary" id="inspect-preview">${icon('document')} Preview</button><button class="button secondary" id="inspect-route">${icon('link')} Connect</button></div>
      <button class="button secondary" id="save-file">${icon('bookmark')} ${starred.has(f.id) ? 'Unsave file' : 'Save for later'}</button>
      <button class="button primary" id="use-source">${icon('plus')} ${sourceIds.has(f.id) ? 'Remove from sources' : 'Add to sources'}</button>`;
  } else if (n) {
    const children = teamNodes().filter(c => c.parent === n.id), files = filesForNode(n.id);
    body = `<div class="inspector-hero"><div class="inspector-symbol" style="color:${n.color}">${icon('folder')}</div><h2>${escapeHTML(n.name)}</h2></div>
      <div class="inspector-stats"><div><strong>${files.length}</strong><span>Files</span></div><div><strong>${children.length}</strong><span>Child nodes</span></div></div>
      ${children.length ? '<h3>CHILD NODES</h3>' + children.map(c => `<button class="node-child-row" data-node="${escapeHTML(c.id)}">${icon('branch')}${escapeHTML(c.name)}</button>`).join('') : ''}
      <h3>LATEST FILES</h3>${files.slice(0, 4).map(fileMini).join('') || '<p>No files yet.</p>'}
      ${files.length ? `<button class="text-button" id="node-files">View all ${files.length} ${icon('arrow')}</button>` : ''}
      <button class="button secondary" id="add-child">${icon('plus')} Add child node</button>
      <button class="button primary" id="upload-node">${icon('upload')} Add files here</button>`;
  } else {
    body = `<div class="inspector-hero"><div class="inspector-symbol">${icon('branch')}</div><h2>Your vault</h2><p>Documents, images, and ideas organized around the way your team thinks.</p></div>
      <div class="inspector-stats"><div><strong>${allFiles().length}</strong><span>Files</span></div><div><strong>${teamNodes().filter(x => !x.parent).length}</strong><span>Main nodes</span></div></div>
      <h3>START WITH</h3>${allFiles().slice(0, 3).map(fileMini).join('')}
      <button class="button secondary" id="inspector-add">${icon('plus')} Create a main node</button>`;
  }

  const sources = sourceIds.size
    ? `<div class="context-list"><h3>SOURCES · ${sourceIds.size}</h3>${[...sourceIds].map(fileById).filter(Boolean).map(s =>
        `<div class="context-tag"><span>${escapeHTML(s.name)}</span><button data-remove-source="${escapeHTML(s.id)}" aria-label="Remove ${escapeHTML(s.name)} from sources">×</button></div>`).join('')}</div>`
    : '';
  el.innerHTML = top + body + sources;
}

function filePreview(f) {
  if (libraryLayout === 'list') return icon(f.type);
  if (f.type === 'image') {
    return `<img data-thumbnail="${escapeHTML(f.id)}" alt="${escapeHTML(f.name)}" loading="lazy" decoding="async">`;
  }
  if (f.type === 'document') {
    return `<div class="paper-preview"><b>${escapeHTML(f.name.replace(/\.[^.]+$/, ''))}</b><span>${escapeHTML(f.name.split('.').pop().toUpperCase())}</span>${'<i></i>'.repeat(9)}</div>`;
  }
  if (f.type === 'data') return '<div class="data-preview">A B C D<br>01 — — —<br>02 — — —<br>03 — — —</div>';
  return icon(f.type);
}

function emptyState() {
  const [title, text] = query ? ['No matching files', 'Try another filename or node name.']
    : nav === 'starred' ? ['No saved files yet', 'Open a file and choose Save for later.']
    : ['Nothing here yet', 'Add files, or connect a file from another node.'];
  return `<div class="empty-state">${icon('inbox')}<h3>${title}</h3><p>${text}</p></div>`;
}

function renderLibrary(files = filteredFiles()) {
  thumbnailObserver?.disconnect();
  renderGeneration++;
  if (view !== 'library') { $('#file-grid').replaceChildren(); return; }

  const totalPages = Math.max(1, Math.ceil(files.length / PAGE_SIZE));
  page = Math.max(0, Math.min(page, totalPages - 1));
  $('#file-grid').classList.toggle('list-layout', libraryLayout === 'list');
  $('#file-grid').innerHTML = pageFiles(files).map((f, i) => {
    const location = nodeById(f.nodeIds[0])?.name || 'Inbox';
    return `<button class="file-card" style="--i:${i}" data-file="${escapeHTML(f.id)}" aria-label="Preview ${escapeHTML(f.name)}"><div class="file-card-preview">${filePreview(f)}</div><div class="file-card-info"><strong title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</strong><small>${typeLabel(f)} · ${bytes(f.size)}</small></div><span class="file-location">${escapeHTML(location)}</span><span class="file-open">${icon('arrow')}</span></button>`;
  }).join('') || emptyState();

  $('#page-range').textContent = files.length
    ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, files.length)} of ${plural(files.length, 'file')}`
    : '0 files';
  $('#page-number').innerHTML = Array.from({ length: totalPages }, (_, i) => `<option value="${i}" ${i === page ? 'selected' : ''}>${i + 1} / ${totalPages}</option>`).join('');
  $('#page-previous').disabled = page === 0;
  $('#page-next').disabled = page >= totalPages - 1;
  $('#grid-layout').setAttribute('aria-pressed', libraryLayout === 'grid');
  $('#list-layout').setAttribute('aria-pressed', libraryLayout === 'list');

  const generation = renderGeneration;
  thumbnailObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      thumbnailObserver.unobserve(entry.target);
      thumbnailQueue = thumbnailQueue.then(() => loadThumbnail(entry.target, generation));
    }
  }, { root: $('#library'), rootMargin: '100px' });
  $$('[data-thumbnail]').forEach(img => thumbnailObserver.observe(img));
}

// Thumbnails are generated one at a time, capped at 320 × 200, and cached (64 entries).
async function loadThumbnail(img, generation) {
  const stale = () => !img.isConnected || generation !== renderGeneration;
  if (stale()) return;
  const id = img.dataset.thumbnail;
  try {
    if (!thumbnailURLs.has(id)) {
      const record = await dbRead(id);
      if (!record?.blob || stale()) return;
      const originalURL = URL.createObjectURL(record.blob);
      let thumb;
      try {
        const image = new Image();
        image.src = originalURL;
        await image.decode();
        const scale = Math.min(320 / image.naturalWidth, 200 / image.naturalHeight, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        thumb = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.8));
      } finally {
        URL.revokeObjectURL(originalURL);
      }
      if (!thumb) throw new Error('Thumbnail unavailable');
      if (stale()) return;
      thumbnailURLs.set(id, URL.createObjectURL(thumb));
      while (thumbnailURLs.size > 64) {
        const oldest = thumbnailURLs.keys().next().value;
        URL.revokeObjectURL(thumbnailURLs.get(oldest));
        thumbnailURLs.delete(oldest);
      }
    }
    if (!stale()) img.src = thumbnailURLs.get(id);
  } catch {
    if (img.isConnected) img.replaceWith(document.createTextNode('Preview unavailable'));
  }
}

function renderRecent() {
  $('#recent-files').innerHTML = [...allFiles()].sort((a, b) => b.created - a.created).slice(0, 4).map((f, i) =>
    `<button class="recent-card" style="--i:${i}" data-file="${escapeHTML(f.id)}"><span class="recent-icon" style="--file-color:${colors[i]}">${icon(f.type)}</span><div><strong title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</strong><small>${escapeHTML(nodeById(f.nodeIds[0])?.name || 'Inbox')}</small></div></button>`
  ).join('');
}

function render() {
  const files = filteredFiles();
  renderNavigation();
  renderInspector();
  renderHeading(files);
  renderLibrary(files);
  renderRecent();
  renderVaultSpace();

  $('#map-container').hidden = view !== 'map';
  $('#library').hidden = view !== 'library';
  for (const [id, name] of [['#map-view', 'map'], ['#library-view', 'library']]) {
    $(id).classList.toggle('active', view === name);
    $(id).setAttribute('aria-pressed', view === name);
  }
  $$('.library-filters button').forEach(b => b.classList.toggle('active', b.dataset.type === typeFilter));
  // The overview shows recent files; any narrowed view gives the space back to the workspace.
  $('.recent-section').hidden = view === 'library' || Boolean(selectedNode) || Boolean(query) || nav !== 'all';

  syncInspector();
  if (view === 'map') buildMap(); else $('#map-labels').replaceChildren();
}

/* ---------- 4. Map ---------- */

function graphData() {
  const scope = selectedNode ? nodeById(selectedNode) : null;
  const files = filteredFiles();
  const root = { id: 'root', kind: 'root', name: 'HANA VAULT', color: colors[0], x: 0, y: 0, z: 0 };
  const fileItems = (list, color) => list.map(f => ({ ...f, kind: 'file', color }));
  // The newest upload batch: everything added within two minutes of the latest file, at most 24.
  const stamps = imports.filter(f => f.team === team).map(f => f.created), latest = Math.max(0, ...stamps);
  const fresh = new Set(files.filter(f => f.created >= latest - 120000).sort((x, y) => y.created - x.created).slice(0, 24).map(f => f.id));

  // Focused view (a node, or search results): the hub sits in the middle and everything it holds spirals out around it.
  if (scope || query) {
    const hub = scope ? { ...scope, kind: 'focus', x: 0, y: 0, z: 0 } : root;
    const children = scope ? teamNodes().filter(n => n.parent === scope.id).map(n => ({ ...n, kind: 'child' })) : [];
    const tree = spiral(hub.id, [...children, ...fileItems(files, scope?.color || colors[0])], 0, 0);
    hub.reach = tree.reach;
    if (scope) hub.y = -tree.top;
    return { points: [hub, ...tree.points], edges: tree.edges, total: files.length, shown: files.length, fresh };
  }

  // Overview: each main node is the centre of its own cluster, spread around the hub.
  const mains = teamNodes().filter(n => !n.parent).slice(0, 18);
  const placed = new Set();
  const clusters = mains.map(n => {
    const direct = files.filter(f => f.nodeIds.includes(n.id) && !placed.has(f.id));
    direct.forEach(f => placed.add(f.id));
    const branches = teamNodes().filter(c => c.parent === n.id).map(c => ({ ...c, kind: 'branch' }));
    return { n, items: [...branches, ...fileItems(direct, n.color)] };
  });
  // Files that are not in any node yet gather in an Inbox cluster of their own.
  const unsorted = files.filter(f => !f.nodeIds.length);
  if (unsorted.length) clusters.push({ n: { id: 'inbox', name: 'Inbox', color: '#8a8a92' }, items: fileItems(unsorted, '#8a8a92') });
  unsorted.forEach(f => placed.add(f.id));
  const reach = Math.max(...clusters.map(c => SPIRAL * Math.sqrt(c.items.length + 6)), 120);
  // Far enough out that neighbouring clusters do not touch.
  const orbit = clusters.length > 1 ? Math.max(300, (2.5 * reach + 60) / (2 * Math.sin(Math.PI / clusters.length))) : 0;
  const points = [root], edges = [];
  clusters.forEach(({ n, items }, i) => {
    const angle = -Math.PI / 2 + (i / clusters.length) * Math.PI * 2;
    const x = Math.cos(angle) * orbit, z = Math.sin(angle) * orbit;
    const tree = spiral(n.id, items, x, z);
    points.push({ ...n, kind: 'main', x, y: -tree.top, z, reach: tree.reach, fresh: items.filter(it => fresh.has(it.id)).length }, ...tree.points);
    edges.push(['root', n.id], ...tree.edges);
  });
  return { points, edges, total: files.length, shown: placed.size, orbit, fresh };
}
let graph = { points: [], edges: [] };
let mapButtons = [], graphPoints = new Map(), mapFrame = 0, cameraFrame = 0, hoverId = null;

function mapNodeLabel(p) {
  if (p.kind === 'root') return 'Show full vault';
  if (p.kind === 'file') return 'Preview ' + escapeHTML(p.name);
  return 'Explore ' + escapeHTML(p.name);
}
function mapNodeIcon(p) {
  if (p.kind === 'root') return '<span>H</span>';
  if (p.kind === 'file') return icon(p.type);
  return icon(p.kind === 'child' || p.kind === 'branch' ? 'branch' : 'folder');
}

function buildMap() {
  graph = graphData();
  graphPoints = new Map(graph.points.map(p => [p.id, p]));
  graph.points.forEach(p => { p.rgb = rgb(p.color); });
  graph.fresh = graph.fresh || new Set();
  graph.files = graph.points.filter(p => p.kind === 'file'); // files are drawn on the canvas: hundreds of DOM nodes make orbiting lag
  $('#map-labels').innerHTML = '<div id="map-tip" class="map-tip" aria-hidden="true"></div>' + graph.points.map((p, i) => {
    if (p.kind === 'file') return '';
    const selected = selectedNode === p.id || selectedFile === p.id;
    // Names sit on the side of a node that faces the hub, so they never run into its branch.
    const above = '';
    return `<button class="map-node ${p.kind} ${above} ${selected ? 'selected' : ''}" data-map-id="${escapeHTML(p.id)}" style="--node-color:${p.color};--i:${Math.min(i, 30)}" data-new="${p.fresh || ''}" aria-label="${mapNodeLabel(p)}"><span class="node-orb">${mapNodeIcon(p)}</span><span class="map-node-name">${escapeHTML(p.name)}</span></button>`;
  }).join('');
  mapButtons = $$('.map-node');
  // Fit the tree that is actually shown, so a small branch is not drawn tiny.
  // Size the view from the tree as the home camera sees it (the ring is round, so turning it barely changes this).
  const halfW = Math.max(...graph.points.map(p => Math.hypot(p.x, p.z)), 60);
  const halfH = Math.max(...graph.points.map(p => Math.abs(p.y * Math.cos(HOME_CAMERA.tilt) - p.z * Math.sin(HOME_CAMERA.tilt))), 60);
  graph.fit = { w: 2 * halfW + 160, h: 2 * halfH + 200 };
  graph.files.forEach((f, i) => { f.order = i / Math.max(graph.files.length, 1); });
  graph.builtAt = performance.now();


  const mainCount = teamNodes().filter(n => !n.parent).length;
  $('#map-summary').textContent = selectedNode || query
    ? `${graph.shown} of ${graph.total} ${query ? 'matching ' : ''}files shown`
    : mainCount > 18 ? `18 of ${mainCount} nodes shown · The rest are in the sidebar` : 'Drag to orbit · Scroll to zoom';
  $('#back-to-vault').hidden = !selectedNode;
  drawMap();
}

// World units to pixels: the whole tree always fits the workspace.
function treeScale(w, h) {
  const { w: fitW, h: fitH } = graph.fit || { w: 1000, h: 700 };
  return Math.min(w / fitW, Math.max(200, h - 150) / fitH, selectedNode ? 0.8 : 1.1) * zoom;
}
function project(p, w, h) {
  const x = p.x * Math.cos(yaw) + p.z * Math.sin(yaw);
  const z = -p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
  const y = p.y * Math.cos(tilt) - z * Math.sin(tilt);
  const depth = p.y * Math.sin(tilt) + z * Math.cos(tilt);
  const scale = treeScale(w, h) * (2400 / Math.max(1200, 2400 + depth));
  return { x: w / 2 + x * scale, y: (h - 130) / 2 + y * scale, depth, scale };
}

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');

const core = { energy: 0, hole: 0, release: 1 };  // energy 0..1 while thinking; hole 0..1 while files are being pulled in
// Keeps the core open for `ms`, for example while a file is being read and spat out.
function holdCoreOpen(ms) { const now = performance.now(); core.hold = { start: core.hold && now < core.hold.until ? core.hold.start : now, until: now + ms }; }
const swirl = { list: [], start: 0, end: 0, active: false, releaseAt: 0, target: null, count: 0 };
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

// Files going in: particles leave `from` (the Add files button by default) and spiral into the core, which turns into a black hole while they arrive.
function absorb(count, from, target = null) {
  const root = positions.get('root');
  core.energy = 1;
  if (reducedMotion || view !== 'map' || !root) return;
  const box = $('#map-container').getBoundingClientRect();
  const button = $('#upload').getBoundingClientRect();
  const ox = (from ? from.x : button.left + button.width / 2) - box.left, oy = (from ? from.y : button.top + button.height / 2) - box.top;
  const now = performance.now(), n = Math.min(160, 30 + count * 8), pages = Math.min(14, count * 2 + 4);
  let latest = 0;
  swirl.target = target; swirl.count += count;
  for (let i = 0; i < n; i++) {
    const delay = Math.random() * 900, dur = 1300 + Math.random() * 900, sign = Math.random() < 0.85 ? 1 : -1;
    swirl.list.push({
      dx: ox + (Math.random() - 0.5) * 70 - root.x, dy: oy + (Math.random() - 0.5) * 50 - root.y,
      spin: sign * (2.6 + Math.random() * 2.2), delay, dur, size: 1 + Math.random() * 1.6, born: now, page: i < pages
    });
    latest = Math.max(latest, delay + dur);
  }
  if (now > swirl.end) swirl.start = now;
  swirl.end = Math.max(swirl.end, now + latest);
}
// Where a particle is at progress e: its start offset shrinks toward the core while the angle keeps turning.
// When the last file is in, a page comes back out of the core and flies to where the files now live.
function ejectPage() {
  const root = positions.get('root');
  if (!root || view !== 'map' || !swirl.count) { swirl.count = 0; return; }
  const box = $('#map-container').getBoundingClientRect();
  const dest = (swirl.target && document.querySelector(`[data-map-id="${CSS.escape(swirl.target)}"]`)) || document.querySelector('[data-nav="inbox"]');
  const to = dest.getBoundingClientRect(), count = swirl.count;
  swirl.count = 0;
  const el = document.createElement('div');
  el.className = 'fly-page';
  el.innerHTML = icon('document') + `<b>${count}</b>`;
  document.body.append(el);
  const sx = box.left + root.x, sy = box.top + root.y, ex = to.left + to.width / 2, ey = to.top + to.height / 2;
  const at = (px, py, scale, opacity) => ({ transform: `translate(${px}px,${py}px) translate(-50%,-50%) scale(${scale})`, opacity });
  el.animate([at(sx, sy, 0.2, 0), at(sx, sy - 50, 1, 1), at((sx + ex) / 2, Math.min(sy, ey) - 110, 1, 1), at(ex, ey, 0.55, 0.9)], { duration: 1200, easing: 'cubic-bezier(.22,1,.36,1)' })
    .finished.then(() => { el.remove(); dest.classList.add('hit'); setTimeout(() => dest.classList.remove('hit'), 900); }, () => el.remove());
}
function swirlAt(p, e, root) {
  const r = Math.hypot(p.dx, p.dy) * Math.pow(1 - e, 1.7), angle = Math.atan2(p.dy, p.dx) + p.spin * e * e;
  return { x: root.x + Math.cos(angle) * r, y: root.y + Math.sin(angle) * r };
}           // 0..1, rises while HANA is "thinking"
let ask = null;                        // { ids: Set, key } after a question
const askKey = () => `${team}|${selectedNode}`;
const askActive = () => ask && ask.key === askKey();
const TAU = Math.PI * 2;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// A circle in 3D, tilted by `slope` and spun by `spin`, projected to the screen.
function circle3(radius, y, w, h, { slope = 0, spin = 0, steps = 72, cx = 0, cz = 0 } = {}) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const u = (i / steps) * TAU;
    let x = Math.cos(u) * radius, z = Math.sin(u) * radius, yy = 0;
    if (slope) { yy = z * Math.sin(slope); z *= Math.cos(slope); }
    const rx = x * Math.cos(spin) + z * Math.sin(spin), rz = -x * Math.sin(spin) + z * Math.cos(spin);
    return project({ x: cx + rx, y: y + yy, z: cz + rz }, w, h);
  });
}
function strokeLine(points, style, width = 1) {
  ctx.beginPath();
  points.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke();
}

// A deterministic 0..1 hash, used for the flicker in the accretion disc and the lensed stars.
const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const HOLE_TINT = [255, 205, 140];   // the warm edge of the disc: [r, g, b]. Set to [255, 255, 255] for pure white.

// The flat accretion disc of a black hole seen at a slant. Rings are broken into short pieces that flicker and brighten on the side moving toward us.
// `half` is 'far' (behind the shadow) or 'near' (in front of it).
function drawDisc(x, y, rs, squash, t, strength, half) {
  const from = half === 'far' ? Math.PI : 0, to = half === 'far' ? TAU : Math.PI, rings = 16, pieces = 44;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < rings; i++) {
    const f = i / (rings - 1), rho = rs * (1.3 + f * 2.1), heat = Math.pow(1 - f, 1.5);
    const spin = t * 1.9 / Math.pow(1.3 + f * 2.1, 1.5);   // inner rings turn faster, like orbiting gas
    const color = HOLE_TINT.map(c => Math.round(255 + (c - 255) * f)), rgb3 = color.join(',');
    for (let k = 0; k < pieces; k++) {
      const a0 = from + (k / pieces) * (to - from), a1 = from + ((k + 1) / pieces) * (to - from);
      const mid = (a0 + a1) / 2, around = mid + spin;
      // Brighter where the gas moves toward us (the left side), and a ragged texture that streams around the hole.
      const beam = 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(mid - Math.PI * 1.02));
      const grain = 0.35 + 0.65 * hash(Math.floor(around * 9 / TAU * 6) + i * 31.7);
      const alpha = strength * beam * grain * (0.12 + 0.85 * heat);
      if (alpha < 0.02) continue;
      ctx.strokeStyle = `rgba(${rgb3},${Math.min(1, alpha)})`;
      ctx.lineWidth = 1.2 + heat * 2.2;
      ctx.beginPath(); ctx.ellipse(x, y, rho, rho * squash, 0, a0, a1 + 0.02); ctx.stroke();
    }
  }
  ctx.restore();
}

// The lensed image of the far side of the disc: it bends up over the top of the shadow and a dimmer copy under the bottom.
function drawLensedArcs(x, y, rs, strength) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let j = 0; j < 7; j++) {
    const rho = rs * (1.03 + j * 0.085), fade = 1 - j / 8;
    const grad = ctx.createLinearGradient(x - rho, y, x + rho, y);
    grad.addColorStop(0, `rgba(255,255,255,${strength * fade})`); grad.addColorStop(0.5, `rgba(${HOLE_TINT.join(',')},${strength * fade * 0.8})`); grad.addColorStop(1, `rgba(${HOLE_TINT.join(',')},${strength * fade * 0.25})`);
    ctx.strokeStyle = grad; ctx.lineWidth = 2.4 - j * 0.25;
    ctx.beginPath(); ctx.arc(x, y, rho, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke();
    ctx.strokeStyle = `rgba(${HOLE_TINT.join(',')},${strength * fade * 0.35})`; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, rs * (1.03 + j * 0.05), Math.PI * 0.12, Math.PI * 0.88); ctx.stroke();
  }
  ctx.restore();
}

// Background stars bent around the hole. Each one drifts inward on a slow spiral (faster near the hole), is stretched sideways as the lens grabs it,
// and fades in at the edge and out before it reaches the shadow, so the stars read as being pulled in, like the files.
function drawLensedStars(x, y, rs, t, strength) {
  for (let i = 0; i < 70; i++) {
    const phase = (hash(i) + t * 0.045) % 1, d = 1 - phase;                  // 0 at the outer edge, 1 near the shadow
    const radius = rs * (2.3 + 6 * d * d), spin = hash(i + 200) * TAU + t * 0.3 / Math.pow(radius / rs, 1.5) + phase * 1.8;
    const bent = radius + (rs * rs * 1.3) / (radius - rs * 0.9), smear = (0.35 + 0.9 * d) * rs / bent;
    const alpha = Math.sin(phase * Math.PI) * (0.25 + 0.35 * hash(i + 400)) * (0.7 + 0.3 * Math.sin(t * 2.2 + i));
    ctx.strokeStyle = `rgba(255,255,255,${strength * alpha})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, bent, spin - smear, spin + smear); ctx.stroke();
  }
}

// The glossy black core: a lit sphere, rings that spin around it, a pulse while it is thinking.
// While files come in, it splits open, the halves melt away and a black hole takes their place:
// a black shadow, a thin bright ring at its edge, a flat disc of hot gas, and the disc's lensed image bent over and under the shadow.
function drawCore(c, t, w, h) {
  const hole = core.hole, e = core.energy;
  const rel = core.release, bounce = rel < 1 ? Math.sin(rel * Math.PI * 3) * (1 - rel) * 0.1 : 0;
  const r = 130 * c.scale * (1 + 0.22 * hole + bounce);
  const x = c.x + Math.sin(t * 47) * hole * (1 - hole) * 4, y = c.y + Math.cos(t * 53) * hole * (1 - hole) * 4;
  const split = smooth(hole / 0.45), reveal = smooth((hole - 0.35) / 0.5);   // 0..1: halves parting, then the hole appearing
  const rs = r * 1.15;                                                           // shadow radius
  const squash = 0.16 + 0.2 * Math.sin(tilt);

  // Floor disc and its soft shadow, like the reference.
  const floor = circle3(270, 130, w, h);
  ctx.globalAlpha = 1 - reveal;
  ctx.beginPath(); floor.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.fillStyle = 'rgba(22,22,24,0.7)'; ctx.fill();
  strokeLine(floor, 'rgba(255,255,255,0.45)');
  const pit = circle3(120, 130, w, h);
  ctx.beginPath(); pit.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fill();
  ctx.globalAlpha = 1;

  // Halo
  const haloR = r * (2.6 + e + reveal * 1.6);
  const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, haloR);
  halo.addColorStop(0, `rgba(255,255,255,${0.1 + e * 0.12 + reveal * 0.1})`);
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, haloR, 0, TAU); ctx.fill();

  // Rings that spin around the glossy ball; they fade as the hole takes over.
  const rings = [{ slope: 0.2, spin: t * 0.35, r: 140 }, { slope: 1.05, spin: -t * 0.5, r: 158 }, { slope: -0.7, spin: t * 0.28 + 1, r: 176 }]
    .map(g => circle3(g.r, 0, w, h, { slope: g.slope, spin: g.spin, steps: 90 }));
  const pass = back => rings.forEach(points => {
    for (let i = 0; i < points.length - 1; i++) {
      const isBack = (points[i].depth + points[i + 1].depth) / 2 > c.depth;
      if (isBack !== back) continue;
      ctx.beginPath(); ctx.moveTo(points[i].x, points[i].y); ctx.lineTo(points[i + 1].x, points[i + 1].y);
      ctx.strokeStyle = `rgba(255,255,255,${(back ? 0.14 : 0.42 + e * 0.3) * (1 - reveal)})`; ctx.lineWidth = 1; ctx.stroke();
    }
  });
  if (reveal > 0.01) drawLensedStars(x, y, rs, t, reveal);
  if (reveal > 0.01) drawDisc(x, y, rs, squash, t, reveal, 'far');
  pass(true);

  // Body: a glossy sphere. As it opens, the two halves part and fade away.
  const drawBody = () => {
    const body = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r);
    body.addColorStop(0, '#4a4a4e'); body.addColorStop(0.28, '#1b1b1d'); body.addColorStop(0.7, '#060607'); body.addColorStop(1, '#000');
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    const rim = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    rim.addColorStop(0, 'rgba(255,255,255,0.05)'); rim.addColorStop(0.5, 'rgba(255,255,255,0.12)'); rim.addColorStop(1, 'rgba(255,255,255,0.7)');
    ctx.strokeStyle = rim; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r - 0.6, 0, TAU); ctx.stroke();
    [[-0.38, -0.4, 0.34, 0.95 * (1 - 0.5 * hole)], [0.1, 0.34, 0.3, (0.22 + e * 0.5) * (1 - hole)]].forEach(([dx, dy, size, alpha]) => {
      const g = ctx.createRadialGradient(x + dx * r, y + dy * r, 0, x + dx * r, y + dy * r, size * r);
      g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, size * r, 0, TAU); ctx.fill();
    });
  };
  const gap = split * r * 0.55;
  if (gap < 1) drawBody();
  else {
    // The opening grows from a slit into the round shadow of the black hole.
    const rx = gap + 2 + (rs - gap - 2) * reveal, ry = r * 0.99 + (rs - r * 0.99) * reveal;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = '#000'; ctx.fill(); ctx.clip();
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      for (let s = 0; s <= 1.001; s += 0.04) {
        const ang = (k / 5) * TAU + t * 3.2 + s * 6, px = x + Math.cos(ang) * (0.15 + s * 0.85) * rx * 1.4, py = y + Math.sin(ang) * (0.15 + s * 0.85) * ry;
        s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.4 * (1 - reveal)})`; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1 - reveal;
    [-1, 1].forEach(side => {
      ctx.save();
      ctx.translate(side * gap * (1 + reveal * 2), 0);
      ctx.beginPath(); ctx.rect(side < 0 ? x - r * 3 : x, y - r * 3, r * 3, r * 6); ctx.clip();
      drawBody();
      ctx.restore();
    });
    ctx.globalAlpha = 1;
    if (reveal < 0.95) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 14 * hole;
      ctx.strokeStyle = `rgba(255,255,255,${(0.25 + hole * 0.65) * (1 - reveal)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  // The eye: a bright point that wanders across the front, faster while thinking.
  const u = t * (0.7 + e * 2.5), front = Math.cos(u);
  if (front > 0 && hole < 0.15) {
    ctx.fillStyle = `rgba(255,255,255,${0.35 + front * 0.65})`;
    ctx.beginPath(); ctx.arc(x + Math.sin(u) * r * 0.72, y + Math.sin(u * 0.5) * r * 0.25 + r * 0.05, 1.8 + e * 1.5, 0, TAU); ctx.fill();
  }
  pass(false);

  if (reveal > 0.01) {
    drawLensedArcs(x, y, rs, reveal * 0.9);
    // Photon ring: light that has gone around the hole, a thin bright edge on the shadow.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = `rgba(${HOLE_TINT.join(',')},1)`; ctx.shadowBlur = 22 * reveal;
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * reveal})`; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(x, y, rs * 1.01, 0, TAU); ctx.stroke();
    ctx.restore();
    drawDisc(x, y, rs, squash, t, reveal, 'near');
    // Lens flare: a thin streak across the hole, as a camera would catch it.
    const flare = ctx.createLinearGradient(x - rs * 5, y, x + rs * 5, y);
    flare.addColorStop(0, 'rgba(255,255,255,0)'); flare.addColorStop(0.5, `rgba(255,235,210,${0.5 * reveal})`); flare.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = flare; ctx.fillRect(x - rs * 5, y - 0.8, rs * 10, 1.6);
  }

  // When the last file lands the hole closes with a flash and a shockwave leaves the core.
  if (rel < 1 && swirl.releaseAt) {
    const flash = Math.max(0, 1 - rel / 0.18);
    if (flash > 0) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
      g.addColorStop(0, `rgba(255,255,255,${0.55 * flash})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, TAU); ctx.fill();
    }
    for (let k = 0; k < 2; k++) {
      const q = Math.min(1, Math.max(0, rel * 1.4 - k * 0.2));
      ctx.strokeStyle = `rgba(255,255,255,${(1 - q) * 0.6})`; ctx.lineWidth = 2 - q;
      ctx.beginPath(); ctx.arc(x, y, r * (1 + q * 3.5), 0, TAU); ctx.stroke();
    }
  }

  // Thinking: pulses leave the core.
  if (e > 0.02) {
    for (let k = 0; k < 2; k++) {
      const phase = (t * 0.9 + k * 0.5) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - phase) * e * 0.5})`;
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r * (1.1 + phase * 1.6), 0, TAU); ctx.stroke();
    }
  }
}

function drawMap(now = performance.now()) {
  if (view !== 'map') return;
  const el = $('#map-container'), canvas = $('#map-canvas');
  const w = el.clientWidth, h = el.clientHeight;
  if (!w || !h) return;
  const t = reducedMotion ? 0 : now / 1000;
  core.energy = Math.max(0, core.energy - 0.012);

  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  positions = new Map(graph.points.map(p => [p.id, project(p, w, h)]));
  const overview = graphPoints.has('root');
  // Gravity: while the core is open, everything around it is bent toward it and twisted a little.
  if (overview && core.hole > 0.01) {
    const root = positions.get('root');
    positions.forEach((q, id) => {
      if (id === 'root') return;
      const dx = q.x - root.x, dy = q.y - root.y, d = Math.hypot(dx, dy) || 1, f = core.hole / (1 + d / 260);
      const ang = Math.atan2(dy, dx) + f * 0.22, nd = d * (1 - f * 0.16);
      q.x = root.x + Math.cos(ang) * nd; q.y = root.y + Math.sin(ang) * nd;
    });
  }
  const elapsed = now - (graph.builtAt || 0);

  // Orbit rings and waves that keep expanding from the core: the map is always "growing".
  if (overview && graph.orbit) {
    const o = graph.orbit;
    strokeLine(circle3(o, 0, w, h), 'rgba(255,255,255,0.07)');
    strokeLine(circle3(o * 0.5, 0, w, h), 'rgba(255,255,255,0.045)');
    ctx.setLineDash([3, 12]); ctx.lineDashOffset = -t * 10;
    strokeLine(circle3(o * 1.18, 0, w, h), 'rgba(255,255,255,0.1)');
    ctx.setLineDash([]);
    for (let k = 0; k < 3; k++) {
      const phase = ((t * 0.12 + k / 3) % 1);
      strokeLine(circle3(o * 1.25 * phase + 40, 0, w, h, { steps: 90 }), `rgba(255,255,255,${(1 - phase) * 0.1})`);
    }
  }

  // Each branch gets a soft wash of its own color.
  graph.points.forEach(p => {
    if (p.kind !== 'main' && p.kind !== 'focus') return;
    const { x, y, scale } = positions.get(p.id);
    const r = (p.reach || 230) * 1.1 * scale;
    const wash = ctx.createRadialGradient(x, y, 0, x, y, r);
    wash.addColorStop(0, `rgba(${p.rgb},0.1)`);
    wash.addColorStop(1, `rgba(${p.rgb},0)`);
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  });

  // Files appear one after another when the map is built.
  const asked = askActive();
  graph.files.forEach(f => { f.vis = reducedMotion ? 1 : Math.max(0, Math.min(1, (elapsed / 1500 - f.order * 0.75) * 3)); });

  // Edges of the same color and state are drawn as one path.
  const batches = new Map();
  graph.edges.forEach(([from, to]) => {
    const a = positions.get(from), b = positions.get(to), target = graphPoints.get(to);
    if (!a || !b || target.vis === 0) return;
    const lit = asked && ask.ids.has(to);
    const active = lit || from === hoverId || to === hoverId || from === selectedNode || to === selectedNode || to === selectedFile;
    const key = target.rgb + (active ? '|a' : asked && target.kind === 'file' ? '|d' : '');
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(a, b);
  });
  batches.forEach((segments, key) => {
    const [color, state] = key.split('|');
    ctx.beginPath();
    for (let i = 0; i < segments.length; i += 2) { ctx.moveTo(segments[i].x, segments[i].y); ctx.lineTo(segments[i + 1].x, segments[i + 1].y); }
    ctx.strokeStyle = `rgba(${color},${state === 'a' ? 0.85 : state === 'd' ? 0.07 : 0.26})`;
    ctx.lineWidth = state === 'a' ? 1.5 : 1;
    ctx.stroke();
  });

  // Data flowing from the core out to each main node.
  if (overview && !reducedMotion) {
    const root = positions.get('root');
    graph.points.forEach((p, i) => {
      if (p.kind !== 'main') return;
      const q = positions.get(p.id), f = (t * 0.22 + i * 0.137) % 1;
      ctx.fillStyle = `rgba(${p.rgb},${Math.sin(f * Math.PI) * 0.9})`;
      ctx.beginPath(); ctx.arc(root.x + (q.x - root.x) * f, root.y + (q.y - root.y) * f, 2.2, 0, TAU); ctx.fill();
    });
  }

  // Files: small rings that shrink with the map so zoomed-out clusters do not overlap.
  graph.files.forEach(f => {
    if (f.vis === 0) return;
    const q = positions.get(f.id), r = 12 * Math.min(1, q.scale * 1.1) * (0.4 + 0.6 * f.vis);
    if (q.x < -20 || q.y < -20 || q.x > w + 20 || q.y > h + 20) return;
    const hit = asked && ask.ids.has(f.id), dim = asked && !hit;
    const on = f.id === hoverId || f.id === selectedFile || hit;
    ctx.globalAlpha = f.vis * (dim ? 0.25 : 1);
    if (hit) {
      const g = ctx.createRadialGradient(q.x, q.y, r * 0.5, q.x, q.y, r * 2.6);
      g.addColorStop(0, `rgba(${f.rgb},0.45)`); g.addColorStop(1, `rgba(${f.rgb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r * 2.6, 0, TAU); ctx.fill();
    }
    if (graph.fresh?.has(f.id) && !asked) {
      // Newest upload: a soft ring that keeps breathing outward.
      const k = reducedMotion ? 0.5 : (t * 0.9 + f.order * 0.13) % 1;
      ctx.strokeStyle = `rgba(${f.rgb},${0.9 * (1 - k)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(q.x, q.y, r * (1.3 + 1.6 * k), 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(${f.rgb},0.22)`; ctx.beginPath(); ctx.arc(q.x, q.y, r * 1.5, 0, TAU); ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(q.x, q.y, r, 0, TAU);
    ctx.fillStyle = on ? `rgba(${f.rgb},0.4)` : '#0b0b0c';
    ctx.fill();
    ctx.strokeStyle = `rgba(${f.rgb},${on ? 1 : 0.6})`;
    ctx.lineWidth = on ? 1.6 : 1;
    ctx.stroke();
    if (r > 7) {
      ctx.fillStyle = `rgba(${f.rgb},0.85)`;
      ctx.fillRect(q.x - r * 0.3, q.y - r * 0.32, r * 0.6, 1.2);
      ctx.fillRect(q.x - r * 0.3, q.y, r * 0.6, 1.2);
      ctx.fillRect(q.x - r * 0.3, q.y + r * 0.32, r * 0.35, 1.2);
    }
    ctx.globalAlpha = 1;
  });

  // The hole opens while files are on their way in and closes once the last one lands.
  const holding = core.hold && now < core.hold.until;
  if (swirl.list.length || holding) { swirl.active = true; core.hole = smooth((now - (swirl.list.length ? swirl.start : core.hold.start)) / 800); core.release = 0; }
  else {
    if (swirl.active) { swirl.active = false; swirl.releaseAt = now; if (overview) setTimeout(ejectPage, 450); }
    core.hole = Math.max(0, core.hole - 0.022);
    core.release = Math.min(1, (now - swirl.releaseAt) / 1200);
  }
  if (overview) drawCore(positions.get('root'), t, w, h);
  if (swirl.list.length && overview) {
    const root = positions.get('root');
    swirl.list = swirl.list.filter(p => {
      const e = (now - p.born - p.delay) / p.dur;
      if (e < 0) return true;
      if (e >= 1) { core.energy = Math.min(1, core.energy + 0.03); return false; }
      const head = swirlAt(p, e, root), tail = swirlAt(p, Math.max(0, e - 0.09), root);
      if (p.page) {
        // A page being stretched toward the core: long along the pull, thin across it, shrinking as it falls in.
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(Math.atan2(root.y - head.y, root.x - head.x) + Math.PI / 2 + (1 - e) * p.spin * 0.15);
        ctx.scale((1 - e * 0.75) * (1 - e * 0.5), (1 + e * e * 3) * (1 - e * 0.5));
        ctx.globalAlpha = Math.min(1, 0.4 + e);
        ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(2, -8); ctx.lineTo(6, -4); ctx.lineTo(6, 8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(3, -1); ctx.moveTo(-3, 2); ctx.lineTo(3, 2); ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = `rgba(255,${Math.round(255 - 60 * e)},${Math.round(255 - 140 * e)},${0.25 + 0.75 * e})`; ctx.lineWidth = p.size * (1 - e * 0.5);
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      return true;
    });
  } else if (!overview) { swirl.list = []; swirl.active = false; }

  mapButtons.forEach(button => {
    const id = button.dataset.mapId, p = positions.get(id);
    if (!p) return;
    const kind = graphPoints.get(id).kind;
    const size = kind === 'branch' ? Math.min(1, p.scale * 1.1) : 1;
    button.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%) scale(${size})`;
    button.style.zIndex = String(kind === 'root' ? 1 : ['main', 'focus'].includes(kind) ? 1500 : Math.round(1000 - p.depth));
  });

  const tip = $('#map-tip'), hovered = graphPoints.get(hoverId);
  if (tip) {
    const shown = hovered?.kind === 'file' && !drag;
    tip.style.opacity = shown ? 1 : 0;
    if (shown) {
      const q = positions.get(hoverId);
      tip.textContent = hovered.name;
      tip.style.transform = `translate(${Math.min(Math.max(q.x, 90), w - 90)}px,${q.y - 24}px) translate(-50%,-100%)`;
    }
  }
  $('#zoom-value').textContent = Math.round(zoom * 100) + '%';
  // Zooming far out swaps the map for the list of vaults.
  const far = Math.max(0, Math.min(1, (0.5 - zoom) / 0.2));
  if (far !== shownFar) {
    shownFar = far;
    const space = $('#vault-space');
    space.style.opacity = far; space.style.visibility = far > 0.02 ? 'visible' : 'hidden';
    $('#map-canvas').style.opacity = $('#map-labels').style.opacity = 1 - far;
    $('#map-labels').style.pointerEvents = far > 0.5 ? 'none' : '';
  }
}
let shownFar = 0;

// The map redraws every frame so the core and the rings keep moving; with reduced motion it only redraws on change.
function scheduleMap() {
  if (reducedMotion && !mapFrame) mapFrame = requestAnimationFrame(() => { mapFrame = 0; drawMap(); });
}
function mapLoop(now) {
  requestAnimationFrame(mapLoop);
  if (!reducedMotion && view === 'map' && !document.hidden) drawMap(now);
}
requestAnimationFrame(mapLoop);
function animateCamera(next) {
  cancelAnimationFrame(cameraFrame);
  const start = { yaw, tilt, zoom }, began = performance.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = now => {
    const t = reduced ? 1 : Math.min(1, (now - began) / 260), e = 1 - Math.pow(1 - t, 3);
    yaw = start.yaw + (next.yaw - start.yaw) * e;
    tilt = start.tilt + (next.tilt - start.tilt) * e;
    zoom = start.zoom + (next.zoom - start.zoom) * e;
    drawMap();
    if (t < 1) cameraFrame = requestAnimationFrame(step);
  };
  if (reduced) step(began + 260); else cameraFrame = requestAnimationFrame(step);
}

let panelAnimation;
function revealSurface(element) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  panelAnimation?.cancel();
  panelAnimation = element.animate(
    [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  );
}

/* ---------- 5. Actions ---------- */

// Back to the unfiltered vault. Callers change whatever should differ.
function resetBrowse() {
  nav = 'all'; selectedNode = null; selectedFile = null; typeFilter = 'all';
  query = ''; page = 0; inspectorOpen = false;
  $('#search').value = '';
}
function syncInspector() {
  $('.vault-body').classList.toggle('show-inspector', inspectorOpen);
  $('#inspector-toggle').setAttribute('aria-expanded', inspectorOpen);
  $('#drop-zone').inert = inspectorOpen && innerWidth <= COMPACT_WIDTH;
}
function toggleInspector(open) { inspectorOpen = open; syncInspector(); scheduleMap(); }
function selectNode(id) {
  selectedNode = id; selectedFile = null; nav = 'all'; page = 0; inspectorOpen = true; zoom = 1;
  render();
  $('#library').scrollTop = 0;
}
function selectFile(id) {
  selectedFile = id;
  mapButtons.forEach(b => b.classList.toggle('selected', b.dataset.mapId === id || b.dataset.mapId === selectedNode));
  renderInspector();
  toggleInspector(true);
}
function setView(next) {
  view = next;
  if (innerWidth <= COMPACT_WIDTH) inspectorOpen = false;
  render();
  revealSurface($('#drop-zone'));
}
function changePage(delta) { page += delta; renderLibrary(); $('#library').scrollTop = 0; scheduleMap(); }

function showNodeDialog(parent = null) {
  $('#node-form').reset();
  $('#node-parent').innerHTML = `<option value="">${escapeHTML(vaultName())} · New main node</option>` + teamNodes().map(n => `<option value="${escapeHTML(n.id)}">${escapeHTML(n.name)}</option>`).join('');
  $('#node-parent').value = parent || '';
  chosenColor = parent ? nodeById(parent).color : colors[0];
  renderColors();
  $('#node-dialog').showModal();
  $('#node-name').focus();
}
function renderColors() {
  $('#color-options').innerHTML = colors.map((c, i) =>
    `<button type="button" class="color-option ${c === chosenColor ? 'selected' : ''}" style="--swatch:${c}" data-color="${c}" aria-label="${colorNames[i]}" aria-pressed="${c === chosenColor}"></button>`
  ).join('');
}

function openUpload(target = selectedNode) { importTarget = target; $('#file-input').click(); }
function detectType(f) {
  if (f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(f.name)) return 'image';
  return /\.(pdf|txt|md|docx?|rtf|odt)$/i.test(f.name) ? 'document' : 'data';
}

async function importFiles(list, target = selectedNode, from = null) {
  const batch = [...list];
  if (!batch.length) return;
  absorb(batch.length, from, target);
  const importTeam = team, failed = [];
  let added = 0;
  const uploadButtons = [$('#upload'), $('#upload-node')].filter(Boolean);
  uploadButtons.forEach(b => { b.disabled = true; });
  toast(`Saving ${plural(batch.length, 'file')} locally…`);

  for (const [index, file] of batch.entries()) {
    if (index % 25 === 0) toast(`Saving files · ${index} of ${batch.length} processed`);
    if (file.size > 50 * 1024 * 1024) { failed.push(`${file.name}: exceeds the prototype's 50 MB per-file limit`); continue; }
    const record = { id: crypto.randomUUID(), name: file.name, type: detectType(file), mime: file.type, size: file.size, team: importTeam, nodeIds: target ? [target] : [], created: Date.now(), blob: file };
    try { await dbWrite(record); imports.unshift(metadata(record)); added++; }
    catch { failed.push(`${file.name}: browser storage could not save it`); }
  }

  uploadButtons.forEach(b => { b.disabled = false; });
  page = 0;
  if (innerWidth <= COMPACT_WIDTH) inspectorOpen = false;
  render();
  toast(failed.length
    ? `${added} saved. ${failed.length} could not be imported. See details.`
    : `${plural(added, 'file')} saved ${target ? 'to ' + (nodes.find(n => n.id === target)?.name || 'node') : 'in Inbox'}.`);
  if (failed.length) showInfo('Some files were not saved', failed.join('\n'));
}

function closePreviewURL() { if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; } }

function previewFile(id) { return openDocument(id); }

function toggleSource(id) {
  if (sourceIds.has(id)) sourceIds.delete(id); else sourceIds.add(id);
  renderInspector();
  const button = $('#preview-source');
  if (button) button.innerHTML = icon('plus') + ' ' + (sourceIds.has(id) ? 'Remove from sources' : 'Add to sources');
  toast(sourceIds.has(id) ? 'Added to sources. AI is not connected in this prototype.' : 'Removed from sources.');
}

function showInfo(title, text) {
  currentPreview = null;
  closePreviewURL();
  $('#preview-dialog').setAttribute('aria-label', title);
  $('#preview-content').innerHTML = `<div class="dialog-heading"><h2>${escapeHTML(title)}</h2><button class="icon-button close-dialog" aria-label="Close">${icon('close')}</button></div><div class="preview-body"><pre>${escapeHTML(text)}</pre></div>`;
  if (!$('#preview-dialog').open) $('#preview-dialog').showModal();
}

const ABOUT = `HANA vault · Interactive design prototype

Explore four starting layouts: investment, analyst, management, and partner. Layout changes preserve the files in other templates.

The map begins with main nodes. Open a node to see a bounded set of file points; the Library gives access to every file through search, filters, sorting, and pages of 48 results. Compact screens show fewer map points so targets remain usable.

Drag the map to orbit, scroll to zoom, or use the rotate and zoom buttons. Click a node to see its details. Click a file point to preview it.

Add main and child nodes. Import files through Add files or drop files onto the workspace. To connect an existing file, open its preview and choose Add to node. Connections reference one original, including when a file is linked to both a parent and its child.

Files stay in this browser. Imported originals are stored locally with a 50 MB per-file prototype limit, and clearing browser data removes these copies. Nothing is synced to Obsidian. Keep your original files. Images and text can be previewed; other formats can be downloaded and opened in their usual app.

The vault starts empty. AI, OCR, document extraction, Obsidian sync, cloud upload, shared access, and real permission enforcement are not connected. Partner is a layout preview, not a secure sharing boundary.`;

/* ---------- 6. Events ---------- */

const clickActions = {
  'new-node': () => showNodeDialog(),
  'sidebar-add': () => showNodeDialog(),
  'inspector-add': () => showNodeDialog(),
  'add-child': () => showNodeDialog(selectedNode),
  'upload': () => openUpload(),
  'upload-node': () => openUpload(),
  'map-view': () => setView('map'),
  'library-view': () => setView('library'),
  'see-all': () => { resetBrowse(); setView('library'); },
  'inspector-toggle': () => toggleInspector(!inspectorOpen),
  'close-inspector': () => { toggleInspector(false); $('#inspector-toggle').focus(); },
  'zoom-in': () => animateCamera({ yaw, tilt, zoom: Math.min(4, zoom + 0.25) }),
  'zoom-out': () => animateCamera({ yaw, tilt, zoom: Math.max(0.2, zoom - 0.15) }),
  'reset-view': () => animateCamera(HOME_CAMERA),
  'orbit-left': () => animateCamera({ yaw: yaw - 0.3, tilt, zoom }),
  'orbit-right': () => animateCamera({ yaw: yaw + 0.3, tilt, zoom }),
  'node-files': () => { page = 0; typeFilter = 'all'; setView('library'); },
  'back-to-vault': () => { resetBrowse(); render(); },
  'page-next': () => changePage(1),
  'page-previous': () => changePage(-1),
  'grid-layout': () => { libraryLayout = 'grid'; renderLibrary(); },
  'list-layout': () => { libraryLayout = 'list'; renderLibrary(); },
  'inspect-preview': () => previewFile(selectedFile),
  'inspect-route': () => showRoute(selectedFile),
  'save-file': () => { if (starred.has(selectedFile)) starred.delete(selectedFile); else starred.add(selectedFile); save(); render(); },
  'use-source': () => toggleSource(selectedFile),
  'preview-source': () => toggleSource(currentPreview),
  'preview-connect': () => showRoute(currentPreview),
  'clear-data': () => { if (confirm('Remove every file you added to this browser? Nodes you created stay.')) location.search = '?reset'; },
  'about': () => showInfo('About this design', ABOUT)
};

document.addEventListener('click', event => {
  const close = event.target.closest('.close-dialog');
  if (close) { close.closest('dialog').close(); return; }

  const node = event.target.closest('[data-node]');
  if (node) {
    selectNode(node.dataset.node);
    if (event.detail === 0) { const heading = $('#inspector h2'); heading.tabIndex = -1; heading.focus(); }
    return;
  }
  const file = event.target.closest('[data-file]');
  if (file) { previewFile(file.dataset.file); return; }

  const map = event.target.closest('[data-map-id]');
  if (map) {
    if (dragging) return;
    const id = map.dataset.mapId;
    if (id === 'root') { if (selectedNode || query) { resetBrowse(); render(); } else { core.energy = 0.7; $('#ask-input').focus(); } }
    else if (fileById(id)) previewFile(id);
    else if (id === 'inbox') document.querySelector('[data-nav="inbox"]').click();
    else selectNode(id);
    return;
  }

  const navButton = event.target.closest('[data-nav]');
  if (navButton) {
    resetBrowse();
    nav = navButton.dataset.nav;
    if (nav !== 'all') view = 'library';
    render();
    revealSurface($('#drop-zone'));
    return;
  }
  const filter = event.target.closest('[data-type]');
  if (filter) { typeFilter = filter.dataset.type; page = 0; render(); $('#library').scrollTop = 0; return; }
  const color = event.target.closest('[data-color]');
  if (color) { chosenColor = color.dataset.color; renderColors(); return; }
  const remove = event.target.closest('[data-remove-source]');
  if (remove) { sourceIds.delete(remove.dataset.removeSource); renderInspector(); return; }

  const button = event.target.closest('button');
  if (button) clickActions[button.id]?.();
  if (event.target.closest('.brand')) { event.preventDefault(); resetBrowse(); view = 'map'; render(); }
});

function newVault() {
  const name = (prompt('Name the new vault:') || '').trim().slice(0, 40);
  if (!name) return null;
  const id = `vault-${Date.now().toString(36)}`;
  vaults.push({ id, name });
  return id;
}
// Switches vault; from the far-out view the camera flies back in to the chosen one.
function switchVault(id, fromSpace = false) {
  team = id;
  resetBrowse();
  sourceIds.clear();
  if (fromSpace) animateCamera(HOME_CAMERA); else ({ yaw, tilt, zoom } = HOME_CAMERA);
  save();
  render();
  toast(`Switched to ${vaultName()}.`);
}
$('#team').addEventListener('change', event => {
  const id = event.target.value === '__new' ? newVault() : event.target.value;
  if (!id) { $('#team').value = team; return; }
  switchVault(id);
});
$('#vault-space').addEventListener('click', event => {
  const b = event.target.closest('[data-vault]');
  if (!b) return;
  const id = b.dataset.vault === '__new' ? newVault() : b.dataset.vault;
  if (id) switchVault(id, true);
});
function renderVaultSpace() {
  const items = [...vaults, { id: '__new', name: 'New vault' }];
  $('#vault-space').innerHTML = items.map((v, i) => {
    const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2, isNew = v.id === '__new';
    const files = imports.filter(f => f.team === v.id).length, mains = nodes.filter(n => n.team === v.id && !n.parent).length;
    return `<button type="button" class="vault-orb ${v.id === team ? 'current' : ''} ${isNew ? 'add' : ''}" data-vault="${escapeHTML(v.id)}" style="left:${50 + 36 * Math.cos(angle)}%;top:${46 + 29 * Math.sin(angle)}%;--d:${i * -0.7}s"><span class="vault-ball">${isNew ? icon('plus') : ''}</span><strong>${escapeHTML(v.name)}</strong>${isNew ? '' : `<small>${plural(files, 'file')} · ${plural(mains, 'node')}</small>`}</button>`;
  }).join('') + '<p class="vault-hint">Scroll in to enter a vault</p>';
}

let searchTimer;
$('#search').addEventListener('input', event => {
  query = event.target.value.trim().toLowerCase();
  page = 0;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { render(); $('#library').scrollTop = 0; }, 100);
});
$('#sort-files').addEventListener('change', event => { sortMode = event.target.value; page = 0; renderLibrary(); $('#library').scrollTop = 0; });
$('#page-number').addEventListener('change', event => { page = Number(event.target.value); renderLibrary(); $('#library').scrollTop = 0; });

$('#node-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#node-name').value.trim();
  if (!name) { $('#node-name').setCustomValidity('Enter a node name.'); $('#node-name').reportValidity(); return; }
  const parent = $('#node-parent').value || null;
  const node = { id: crypto.randomUUID(), name, parent, color: chosenColor, team };
  nodes.push(node);
  save();
  $('#node-dialog').close();
  resetBrowse();
  selectedNode = node.id;
  inspectorOpen = true;
  render();
  toast(parent ? 'Child node connected.' : 'Main node created.');
});
$('#node-name').addEventListener('input', () => $('#node-name').setCustomValidity(''));
$('#route-form').addEventListener('submit', async event => { event.preventDefault(); await connectFile(pendingRoute, $('#route-node').value); $('#route-dialog').close(); });
$('#file-input').addEventListener('change', async event => { await importFiles(event.target.files, importTarget); event.target.value = ''; });
$('#preview-dialog').addEventListener('close', () => { currentPreview = null; closePreviewURL(); });

// Clicking a dialog's backdrop closes it.
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
}));
document.addEventListener('keydown', event => {
  if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('dialog[open]')) {
    event.preventDefault();
    $('#search').focus();
  }
});

// Ask HANA: a local answer for now. It scores the files in view against the question's keywords and lights the matches up on the map.
// ponytail: keyword matching stands in for a model; replace answerQuestion() with a real call to make it conversational.
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'what', 'which', 'where', 'show', 'find', 'all', 'any', 'about', 'from', 'are', 'was', 'file', 'files', 'documents', 'docs', 'me', 'my', 'our']);
function answerQuestion(question) {
  const terms = [...new Set(question.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOP_WORDS.has(t)))];
  if (!terms.length) return { terms, matches: [] };
  const text = vaultIndex.searchText;
  const matches = filteredFiles()
    .map(f => ({ f, score: terms.filter(t => text.get(f.id).includes(t)).length }))
    .filter(m => m.score > 0)
    .sort((x, y) => y.score - x.score || y.f.created - x.f.created);
  return { terms, matches };
}
function showAnswer(html, thinking = false) {
  const box = $('#ask-answer');
  box.hidden = !html;
  box.classList.toggle('thinking', thinking);
  box.innerHTML = html;
  $('#ask-clear').hidden = !html;
}
function clearAsk() { ask = null; showAnswer(''); $('#ask-input').value = ''; scheduleMap(); }
$('#ask-clear').addEventListener('click', clearAsk);
$('#ask-attach').addEventListener('click', () => openUpload());
// Voice: browser speech recognition fills the box as you talk, then asks when you stop.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let listening = null;
$('#ask-mic').addEventListener('click', () => {
  if (listening) { listening.stop(); return; }
  if (!Recognition) { toast('Voice needs Chrome or Edge.'); return; }
  const r = listening = new Recognition(), input = $('#ask-input'), button = $('#ask-mic');
  r.interimResults = true; r.lang = navigator.language || 'en-US';
  r.onresult = e => { input.value = [...e.results].map(x => x[0].transcript).join(''); };
  r.onerror = e => { if (e.error !== 'aborted' && e.error !== 'no-speech') toast(e.error === 'not-allowed' ? 'Allow the microphone to use voice.' : 'Voice stopped: ' + e.error); };
  r.onend = () => { listening = null; button.classList.remove('listening'); core.energy = 0; if (input.value.trim()) $('#ask-form').requestSubmit(); };
  button.classList.add('listening'); core.energy = 0.8; input.focus(); r.start();
});
$('#ask-input').addEventListener('keydown', event => { if (event.key === 'Escape') clearAsk(); });
$('#ask-form').addEventListener('submit', event => {
  event.preventDefault();
  const question = $('#ask-input').value.trim();
  if (!question) return;
  core.energy = 1;
  showAnswer('Looking through the vault…', true);
  setTimeout(() => {
    const { terms, matches } = answerQuestion(question);
    if (!matches.length) {
      ask = null;
      showAnswer(terms.length ? `Nothing matches <strong>${escapeHTML(terms.join(', '))}</strong>. Try a project name or a document type.` : 'Try a few keywords, like a project name or "quality of earnings".');
      return;
    }
    ask = { ids: new Set(matches.slice(0, 80).map(m => m.f.id)), key: askKey() };
    const perNode = new Map();
    matches.forEach(({ f }) => { const name = nodeById(f.nodeIds[0])?.name || 'Inbox'; perNode.set(name, (perNode.get(name) || 0) + 1); });
    const where = [...perNode].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([name, n]) => `${escapeHTML(name)} (${n})`).join(', ');
    const top = matches.slice(0, 3).map(({ f }) => `<button type="button" data-file="${escapeHTML(f.id)}" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</button>`).join('');
    showAnswer(`<strong>${matches.length} ${matches.length === 1 ? 'file' : 'files'}</strong> match, mostly in ${where}. Closest:${top}`);
    core.energy = 0.35;
    scheduleMap();
  }, reducedMotion ? 0 : 650);
});

// Map: hovering a node lights up its branch; drag to orbit, wheel to zoom.
function fileAt(event) {
  const box = $('#map-canvas').getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
  let best = null, bestDistance = Infinity;
  for (const f of graph.files || []) {
    const q = positions.get(f.id);
    if (!q) continue;
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < 14 * Math.min(1, q.scale * 1.1) + 3 && d < bestDistance) { best = f; bestDistance = d; }
  }
  return best;
}
$('#map-container').addEventListener('pointermove', event => {
  if (drag || event.target.closest('.map-node, .map-controls')) return;
  const hit = fileAt(event);
  $('#map-container').classList.toggle('over-file', !!hit);
  if ((hit?.id || null) !== hoverId) { hoverId = hit?.id || null; scheduleMap(); }
});
$('#map-container').addEventListener('pointerleave', () => { hoverId = null; scheduleMap(); });
$('#map-container').addEventListener('click', event => {
  if (dragging || event.target.closest('.map-node, .map-controls, .map-context')) return;
  const hit = fileAt(event);
  if (hit) previewFile(hit.id);
});
$('#map-labels').addEventListener('pointerover', event => { hoverId = event.target.closest('.map-node')?.dataset.mapId || null; scheduleMap(); });
$('#map-labels').addEventListener('pointerout', () => { hoverId = null; scheduleMap(); });
$('#map-container').addEventListener('pointerdown', event => {
  if (event.target.closest('.map-controls')) return;
  cancelAnimationFrame(cameraFrame);
  drag = { x: event.clientX, y: event.clientY, yaw, tilt, pointer: event.pointerId };
  dragging = false;
});
window.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointer) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) < 6) return;
  dragging = true;
  $('#map-container').classList.add('dragging');
  yaw = drag.yaw + dx * 0.004;
  tilt = Math.max(0.25, Math.min(1.15, drag.tilt + dy * 0.003)); // never edge-on
  scheduleMap();
});
window.addEventListener('pointerup', () => { drag = null; $('#map-container').classList.remove('dragging'); setTimeout(() => { dragging = false; }, 0); });
window.addEventListener('pointercancel', () => { drag = null; dragging = false; $('#map-container').classList.remove('dragging'); });
$('#map-container').addEventListener('wheel', event => {
  event.preventDefault();
  cancelAnimationFrame(cameraFrame);
  zoom = Math.max(0.2, Math.min(4, zoom - event.deltaY * 0.0015));
  scheduleMap();
}, { passive: false });

// Pointer routing avoids native image dragging; file connections also have a keyboard-accessible dialog.
let routingFile = null, routingTarget = null, routeClickBlocked = false;
function clearRouting() {
  routingTarget?.classList.remove('drop-target');
  routingTarget = null;
  document.body.classList.remove('routing-file');
}
document.addEventListener('pointerdown', event => {
  const file = event.target.closest('.file-card');
  if (file && event.pointerType === 'mouse' && event.button === 0) {
    routingFile = { id: file.dataset.file, x: event.clientX, y: event.clientY, pointer: event.pointerId, moved: false };
  }
});
document.addEventListener('pointermove', event => {
  if (!routingFile || event.pointerId !== routingFile.pointer) return;
  if (!routingFile.moved && Math.hypot(event.clientX - routingFile.x, event.clientY - routingFile.y) < 8) return;
  if (!routingFile.moved) toast('Release over a named node to add a connection.');
  routingFile.moved = true;
  routeClickBlocked = true;
  document.body.classList.add('routing-file');
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-node],[data-map-id]');
  routingTarget?.classList.remove('drop-target');
  routingTarget = target && nodeById(target.dataset.node || target.dataset.mapId) ? target : null;
  routingTarget?.classList.add('drop-target');
});
document.addEventListener('pointerup', event => {
  if (!routingFile || event.pointerId !== routingFile.pointer) return;
  const file = routingFile;
  routingFile = null;
  const id = routingTarget?.dataset.node || routingTarget?.dataset.mapId;
  clearRouting();
  if (file.moved) {
    if (id) connectFile(file.id, id);
    else toast('Choose a named node, or use Add to node in the file preview.');
  }
  setTimeout(() => { routeClickBlocked = false; }, 0);
});
document.addEventListener('click', event => {
  if (routeClickBlocked) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
window.addEventListener('pointercancel', () => { routingFile = null; routeClickBlocked = false; clearRouting(); });
window.addEventListener('blur', () => { routingFile = null; routeClickBlocked = false; clearRouting(); });
document.addEventListener('dragstart', event => { if (event.target.closest('.file-card')) event.preventDefault(); });

// Dropping files onto the workspace imports them; dropping onto a node imports into that node.
document.addEventListener('dragover', event => {
  if (!event.target.closest('#drop-zone,[data-node],[data-map-id]')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  $('#drop-zone').classList.add('drag-over');
});
document.addEventListener('dragleave', event => {
  if (!event.relatedTarget || !$('#drop-zone').contains(event.relatedTarget)) $('#drop-zone').classList.remove('drag-over');
});
document.addEventListener('dragend', () => $('#drop-zone').classList.remove('drag-over'));
document.addEventListener('drop', async event => {
  if (!event.target.closest('#drop-zone,[data-node],[data-map-id]')) return;
  event.preventDefault();
  $('#drop-zone').classList.remove('drag-over');
  const node = event.target.closest('[data-node],[data-map-id]');
  const proposed = node?.dataset.node || node?.dataset.mapId;
  const targetId = nodeById(proposed) ? proposed : selectedNode;
  const id = event.dataTransfer.getData('application/x-hana-file') || event.dataTransfer.getData('text/plain');
  if (!id) await importFiles(event.dataTransfer.files, targetId, { x: event.clientX, y: event.clientY });
  else if (targetId) await connectFile(id, targetId);
  else toast('Drop onto a named node to add a connection.');
});

new ResizeObserver(scheduleMap).observe($('#map-container'));
let compactMap = innerWidth < 620;
window.addEventListener('resize', () => {
  syncInspector();
  const compact = innerWidth < 620;
  if (compact !== compactMap) { compactMap = compact; if (view === 'map') buildMap(); }
});
window.addEventListener('pagehide', () => { thumbnailURLs.forEach(url => URL.revokeObjectURL(url)); thumbnailURLs.clear(); });

hydrateIcons();
render();
loadImports();

$('#rename-vault').addEventListener('click', event => {
  event.preventDefault();
  const name = (prompt('Rename this vault:', vaultName()) || '').trim().slice(0, 40);
  if (!name) return;
  vaults.find(v => v.id === team).name = name;
  save(); render();
});
