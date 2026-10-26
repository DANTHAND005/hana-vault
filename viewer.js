'use strict';

/* File viewer: the black core opens and spits the file out as a 3D card.
   PDFs are drawn with pdf.js, Excel and CSV with SheetJS (both in vendor/, loaded when first needed).
   Images, text and markdown show directly. Other formats get a card with a download button. */

const loaded = new Map();
function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => { loaded.delete(src); reject(new Error(`Could not load ${src}`)); };
      document.head.append(el);
    }));
  }
  return loaded.get(src);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const extensionOf = name => name.split('.').pop().toLowerCase();
let viewer = null;   // the open document, if any

/* ---------- Renderers: each returns { el, width, height, pages, show(page) } ---------- */

function cardSize(ratio, maxWidth = 0.9) {
  const height = Math.min(innerHeight * 0.66, 720), width = Math.min(height * ratio, innerWidth * maxWidth);
  return { width, height: width / ratio };
}

async function renderPDF(blob) {
  await loadScript('vendor/pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const first = await pdf.getPage(1), base = first.getViewport({ scale: 1 });
  const { width, height } = cardSize(base.width / base.height, 0.7);
  const canvas = document.createElement('canvas');
  canvas.className = 'doc-canvas';
  let token = 0;
  const show = async n => {
    const mine = ++token, page = await pdf.getPage(n);
    const scale = (height * Math.max(1.6, Math.min(devicePixelRatio || 1, 2))) / page.getViewport({ scale: 1 }).height, view = page.getViewport({ scale });
    const off = document.createElement('canvas');
    off.width = view.width; off.height = view.height;
    await page.render({ canvasContext: off.getContext('2d'), viewport: view }).promise;
    if (mine !== token) return;
    canvas.width = off.width; canvas.height = off.height;
    canvas.getContext('2d').drawImage(off, 0, 0);
  };
  await show(1);
  return { el: canvas, width, height, pages: pdf.numPages, show, paper: true };
}

async function renderSheet(blob, name) {
  await loadScript('vendor/xlsx.core.min.js');
  const csv = /\.(csv|tsv|txt)$/i.test(name);
  const book = csv ? XLSX.read(await blob.text(), { type: 'string' }) : XLSX.read(await blob.arrayBuffer(), { type: 'array', cellDates: true });
  const wrap = document.createElement('div');
  wrap.className = 'doc-sheet';
  const grid = document.createElement('div'), tabs = document.createElement('div');
  grid.className = 'doc-grid'; tabs.className = 'doc-tabs';
  wrap.append(grid, tabs);
  const letters = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const draw = index => {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[index]], { header: 1, raw: false, defval: '' }).slice(0, 300);
    const cols = Math.min(Math.max(1, ...rows.map(r => r.length)), 20);
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th></th>${Array.from({ length: cols }, (_, c) => `<th>${letters(c)}</th>`).join('')}</tr></thead><tbody>${
      rows.map((r, i) => `<tr><th>${i + 1}</th>${Array.from({ length: cols }, (_, c) => `<td>${escapeHTML(String(r[c] ?? ''))}</td>`).join('')}</tr>`).join('')
    }</tbody>`;
    grid.replaceChildren(table);
    grid.scrollTop = 0;
    [...tabs.children].forEach((t, i) => t.classList.toggle('active', i === index));
  };
  book.SheetNames.forEach((sheet, i) => {
    const tab = document.createElement('button');
    tab.type = 'button'; tab.textContent = sheet;
    tab.addEventListener('click', () => draw(i));
    tabs.append(tab);
  });
  draw(0);
  const { width, height } = cardSize(1.55);
  return { el: wrap, width, height, pages: 1, show() {} };
}

async function renderImage(blob, name) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.className = 'doc-image'; img.alt = name; img.src = url;
  await img.decode().catch(() => { throw new Error('This image format cannot be previewed here.'); });
  const { width, height } = cardSize(img.naturalWidth / img.naturalHeight, 0.8);
  return { el: img, width, height, pages: 1, show() {}, url };
}

async function renderText(blob) {
  const text = await blob.slice(0, 250000).text();
  const pre = document.createElement('pre');
  pre.className = 'doc-text';
  pre.textContent = text + (blob.size > 250000 ? '\n\nPreview limited to the first 250 KB.' : '');
  const { width, height } = cardSize(0.78);
  return { el: pre, width, height, pages: 1, show() {}, paper: true };
}

function renderOther(f) {
  const box = document.createElement('div');
  box.className = 'doc-other';
  box.innerHTML = `${icon(f.type)}<h3>${escapeHTML(extensionOf(f.name).toUpperCase())} file</h3><p>This format cannot be shown here yet. The original is stored and can be downloaded.</p>`;
  const { width, height } = cardSize(0.78);
  return { el: box, width, height, pages: 1, show() {} };
}

async function renderFor(f, blob) {
  const ext = extensionOf(f.name);
  if (f.type === 'image') return renderImage(blob, f.name);
  if (ext === 'pdf') return renderPDF(blob);
  if (/^(xlsx|xlsm|xlsb|xls|ods|csv|tsv)$/.test(ext)) return renderSheet(blob, f.name);
  if (/^(txt|md|json|log|ya?ml)$/.test(ext) || f.mime?.startsWith('text/')) return renderText(blob);
  return renderOther(f);
}

/* ---------- The stage ---------- */

function buildStage() {
  const stage = $('#doc-stage');
  stage.innerHTML = `<div class="doc-backdrop"></div>
    <div class="doc-scene"><div class="doc-fly"><div class="doc-tilt"></div><div class="doc-shadow"></div></div></div>
    <div class="doc-bar"></div>`;
  stage.addEventListener('click', event => { if (event.target.classList.contains('doc-backdrop') || event.target.classList.contains('doc-scene')) closeDocument(); });
  stage.addEventListener('pointermove', event => {
    if (!viewer) return;
    viewer.aim = { x: event.clientX / innerWidth - 0.5, y: event.clientY / innerHeight - 0.5 };
  });
  return stage;
}

// Where the card leaves from and returns to: the core when the map is showing, otherwise below the screen.
function coreOrigin() {
  const root = typeof positions !== 'undefined' && positions.get('root');
  if (view === 'map' && root && !selectedNode) {
    const box = $('#map-container').getBoundingClientRect();
    return { x: box.left + root.x, y: box.top + root.y, core: true };
  }
  return { x: innerWidth / 2, y: innerHeight + 120, core: false };
}
const flyFrom = (origin, scale = 0.04) => `translate(${origin.x - innerWidth / 2}px,${origin.y - innerHeight / 2}px) scale(${scale})`;

async function openDocument(id) {
  const f = fileById(id);
  if (!f) return;
  if (viewer) await closeDocument(true);
  currentPreview = id;
  selectedFile = id;
  const stage = $('#doc-stage').firstElementChild ? $('#doc-stage') : buildStage();
  const mine = viewer = { id, origin: coreOrigin(), aim: { x: 0, y: 0 }, rx: 0, ry: 0, rendered: null, closing: false };

  // The core opens while the file is read, so the card has somewhere to come from.
  if (mine.origin.core) holdCoreOpen(1800);
  let rendered;
  try {
    const record = await dbRead(id);
    if (!record?.blob) throw new Error('File is no longer available in browser storage.');
    mine.record = record;
    [rendered] = await Promise.all([renderFor(f, record.blob), sleep(mine.origin.core ? 700 : 0)]);
  } catch (error) {
    if (viewer !== mine) return;
    rendered = { el: Object.assign(document.createElement('div'), { className: 'doc-other', innerHTML: `${icon(f.type)}<h3>Could not open this file</h3><p>${escapeHTML(error.message || '')}</p>` }), ...cardSize(0.78), pages: 1, show() {} };
  }
  if (viewer !== mine) return;
  mine.rendered = rendered;

  const tilt3d = stage.querySelector('.doc-tilt');
  tilt3d.style.setProperty('--w', `${rendered.width}px`);
  tilt3d.style.setProperty('--h', `${rendered.height}px`);
  tilt3d.innerHTML = `${Array.from({ length: 5 }, (_, i) => `<i class="doc-slice" style="transform:translateZ(${-(i + 1) * 2}px)"></i>`).join('')}
    <div class="doc-back"><span>${icon('branch')}</span></div>
    <div class="doc-card ${rendered.paper ? 'paper' : ''}"></div>`;
  const card = tilt3d.querySelector('.doc-card');
  card.append(rendered.el);
  const sheen = document.createElement('div');
  sheen.className = 'doc-sheen';
  card.append(sheen);
  mine.sheen = sheen;

  renderBar(stage.querySelector('.doc-bar'), f, mine);
  stage.hidden = false;
  document.body.classList.add('doc-open');

  const fly = stage.querySelector('.doc-fly'), bar = stage.querySelector('.doc-bar'), backdrop = stage.querySelector('.doc-backdrop');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduced ? 1 : 500, fill: 'both' });
  bar.animate([{ opacity: 0, transform: 'translate(-50%,16px)' }, { opacity: 1, transform: 'translate(-50%,0)' }], { duration: reduced ? 1 : 500, delay: reduced ? 0 : 750, fill: 'both', easing: 'cubic-bezier(.22,1,.36,1)' });
  const o = mine.origin;
  fly.animate(reduced ? [{ opacity: 0 }, { opacity: 1 }] : [
    { transform: `${flyFrom(o)} rotateX(70deg) rotateY(-220deg) rotateZ(20deg)`, opacity: 0, offset: 0 },
    { transform: `${flyFrom({ x: o.x, y: o.y - 160 }, 0.35)} rotateX(40deg) rotateY(-110deg) rotateZ(10deg)`, opacity: 1, offset: 0.3 },
    { transform: 'translate(0,-24px) scale(1.05) rotateX(-8deg) rotateY(10deg) rotateZ(0)', opacity: 1, offset: 0.72 },
    { transform: 'translate(0,0) scale(1) rotateX(0) rotateY(0) rotateZ(0)', opacity: 1, offset: 1 }
  ], { duration: reduced ? 200 : 1400, easing: 'cubic-bezier(.2,.85,.25,1)', fill: 'both' });
  mine.settled = performance.now() + (reduced ? 200 : 1400);
  mine.frame = requestAnimationFrame(function loop(now) { if (viewer !== mine) return; floatCard(mine, now); mine.frame = requestAnimationFrame(loop); });
  stage.querySelector('#doc-close').focus({ preventScroll: true });
}

// The card follows the pointer a little and breathes, so it always reads as a solid object.
function floatCard(state, now) {
  const tiltEl = $('#doc-stage .doc-tilt');
  if (!tiltEl || state.closing) return;
  const settled = now > state.settled, t = now / 1000;
  const ty = (settled ? state.aim.x * 30 : 0) + Math.sin(t * 0.9) * 1.6, tx = (settled ? -state.aim.y * 22 : 0) + Math.cos(t * 0.7) * 1.2;
  state.ry += (ty - state.ry) * 0.08; state.rx += (tx - state.rx) * 0.08;
  tiltEl.style.transform = `rotateX(${state.rx}deg) rotateY(${state.ry}deg)`;
  state.sheen?.style.setProperty('--sx', `${50 + state.ry * 3}%`);
  state.sheen?.style.setProperty('--sy', `${30 - state.rx * 3}%`);
  $('#doc-stage .doc-shadow').style.transform = `translateX(${-state.ry * 3}px) scale(${1 - Math.abs(state.rx) * 0.01})`;
}

function renderBar(bar, f, state) {
  const r = state.rendered, ext = extensionOf(f.name);
  const editable = /^(txt|md|json|log|ya?ml|csv|tsv)$/.test(ext) || (f.mime?.startsWith('text/') && ext !== 'pdf');
  bar.innerHTML = `<div class="doc-info"><strong title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</strong><span>${typeLabel(f)} · ${fileMeta(f)}${r.pages > 1 ? ` · <b id="doc-page-label">1 / ${r.pages}</b>` : ''}</span></div>
    <div class="doc-actions">
      ${r.pages > 1 ? `<button type="button" class="icon-button" id="doc-prev" aria-label="Previous page">${icon('arrow')}</button><button type="button" class="icon-button" id="doc-next" aria-label="Next page">${icon('arrow')}</button>` : ''}
      <button type="button" class="button secondary" id="preview-connect">${icon('link')} Add to node</button>
      <button type="button" class="button secondary" id="preview-source">${icon('plus')} ${sourceIds.has(f.id) ? 'Remove from sources' : 'Add to sources'}</button>
      ${editable ? `<button type="button" class="button secondary" id="doc-edit">${icon('edit')} Edit</button>` : ''}
      <button type="button" class="button secondary" id="doc-download">${icon('download')} Download</button>
      <button type="button" class="button secondary danger" id="doc-delete">${icon('trash')} Delete</button>
      <button type="button" class="icon-button" id="doc-close" aria-label="Close">${icon('close')}</button>
    </div>`;
  let page = 1;
  const turn = async delta => {
    const next = page + delta;
    if (next < 1 || next > r.pages) return;
    page = next;
    const tiltEl = $('#doc-stage .doc-tilt');
    const half = { duration: 180, easing: 'ease-in', fill: 'forwards' };
    await tiltEl.animate([{ translate: '0 0', rotate: '0deg' }, { translate: `${delta * -40}px 0`, rotate: `${delta * 4}deg`, opacity: 0.2 }], half).finished.catch(() => {});
    await r.show(page);
    $('#doc-page-label').textContent = `${page} / ${r.pages}`;
    tiltEl.getAnimations().forEach(a => a.cancel());
    tiltEl.animate([{ translate: `${delta * 40}px 0`, opacity: 0.2 }, { translate: '0 0', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
  };
  bar.querySelector('#doc-prev')?.addEventListener('click', () => turn(-1));
  bar.querySelector('#doc-next')?.addEventListener('click', () => turn(1));
  state.turn = turn;
  bar.querySelector('#doc-close').addEventListener('click', () => closeDocument());
  bar.querySelector('#doc-delete').addEventListener('click', async () => {
    if (!confirm(`Delete "${f.name}"? It will be removed from this browser.`)) return;
    await closeDocument();
    await deleteFile(f.id);
    toast('File deleted.');
  });
  bar.querySelector('#doc-edit')?.addEventListener('click', async () => {
    const box = document.createElement('textarea');
    box.className = 'doc-edit'; box.value = await state.record.blob.text(); box.spellcheck = false;
    const old = r.el; old.replaceWith(box); box.focus();
    const actions = bar.querySelector('.doc-actions');
    actions.innerHTML = `<span class="doc-editing">Editing</span><button type="button" class="button secondary" id="edit-cancel">Cancel</button><button type="button" class="button" id="edit-save">Save changes</button>`;
    actions.querySelector('#edit-cancel').addEventListener('click', () => { box.replaceWith(old); renderBar(bar, f, state); });
    actions.querySelector('#edit-save').addEventListener('click', async () => {
      try { await saveFileText(f.id, box.value); toast('Changes saved.'); openDocument(f.id); }
      catch (error) { toast('Could not save: ' + (error.message || 'storage error')); }
    });
  });
  bar.querySelector('#doc-download').addEventListener('click', () => {
    const url = URL.createObjectURL(state.record.blob), a = document.createElement('a');
    a.href = url; a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

// The card is pulled back into the core, which opens for it and closes again.
async function closeDocument(instant = false) {
  const state = viewer;
  if (!state || state.closing) return;
  state.closing = true;
  const stage = $('#doc-stage');
  const fly = stage.querySelector('.doc-fly'), bar = stage.querySelector('.doc-bar'), backdrop = stage.querySelector('.doc-backdrop');
  const reduced = instant || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const origin = coreOrigin();
  if (origin.core && !reduced) holdCoreOpen(1100);
  stage.querySelector('.doc-tilt').style.transform = '';
  bar.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 1 : 200, fill: 'forwards' });
  backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 1 : 700, delay: reduced ? 0 : 300, fill: 'forwards' });
  if (!reduced) {
    await fly.animate([
      { transform: 'translate(0,0) scale(1) rotateX(0) rotateY(0) rotateZ(0)', opacity: 1 },
      { transform: 'translate(0,-30px) scale(1.04) rotateX(10deg) rotateY(-20deg)', opacity: 1, offset: 0.25 },
      { transform: `${flyFrom(origin)} rotateX(70deg) rotateY(220deg) rotateZ(-20deg)`, opacity: 0.4 }
    ], { duration: 850, easing: 'cubic-bezier(.6,0,.9,.4)', fill: 'forwards' }).finished.catch(() => {});
  }
  cancelAnimationFrame(state.frame);
  if (state.rendered?.url) URL.revokeObjectURL(state.rendered.url);
  if (viewer === state) viewer = null;
  currentPreview = null;
  stage.hidden = true;
  stage.querySelectorAll('*').forEach(el => el.getAnimations?.().forEach(a => a.cancel()));
  document.body.classList.remove('doc-open');
}

document.addEventListener('keydown', event => {
  if (!viewer || $('dialog[open]')) return;
  if (event.key === 'Escape') closeDocument();
  else if (event.key === 'ArrowRight') viewer.turn?.(1);
  else if (event.key === 'ArrowLeft') viewer.turn?.(-1);
});
