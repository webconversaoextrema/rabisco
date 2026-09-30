const api = window.rabisco;
const { COLORS, SIZES, TEXT_SIZES } = window.RABISCO;

const board = document.getElementById('board'); // traços finalizados
const live = document.getElementById('live'); // traço em andamento e cursor da borracha
const bctx = board.getContext('2d');
const lctx = live.getContext('2d');
const scratch = document.createElement('canvas'); // apoio para traços semitransparentes
const sctx = scratch.getContext('2d');
const toastEl = document.getElementById('toast');

const HISTORY_LIMIT = 200;
const TOOL_KEYS = { p: 'pen', h: 'highlighter', e: 'eraser', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', t: 'text' };

let state = { tool: 'pen', color: COLORS[0], size: 4, drawing: false, background: 'none' };
let strokes = [];
let past = [];
let future = [];
let current = null; // traço sendo desenhado
let erasing = null; // { changed } durante um arraste da borracha
let editor = null; // caixa de texto aberta

// ---------- Tamanhos ----------

const highlightWidth = (size) => size * 3 + 10;
const eraserRadius = () => Math.max(8, state.size * 2.5);
const font = (px) => `600 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;

// ---------- Canvas ----------

function resize() {
  const dpr = window.devicePixelRatio || 1;
  for (const canvas of [board, live, scratch, shotMask]) {
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }
  for (const canvas of [board, live]) {
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
  }
  for (const ctx of [bctx, lctx, sctx, mctx]) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (selecting) drawSelection();
  redraw();
}

function redraw() {
  bctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const s of strokes) drawStroke(bctx, s);
}

function clearLive() {
  lctx.clearRect(0, 0, innerWidth, innerHeight);
}

// ---------- Desenho ----------

function smoothPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) {
    ctx.lineTo(pts[0].x + 0.01, pts[0].y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawFree(ctx, s) {
  const pts = s.points;
  if (!s.pressure || pts.length < 2) {
    smoothPath(ctx, pts);
    ctx.stroke();
    return;
  }
  // Caneta de mesa digitalizadora: espessura acompanha a pressão.
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    ctx.lineWidth = s.size * (0.35 + 1.3 * ((a.p + b.p) / 2));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawArrow(ctx, a, b, size) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const head = Math.max(12, size * 4);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x - Math.cos(angle) * head * 0.7, b.y - Math.sin(angle) * head * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(angle - 0.45), b.y - head * Math.sin(angle - 0.45));
  ctx.lineTo(b.x - head * Math.cos(angle + 0.45), b.y - head * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
}

function shapePath(ctx, s) {
  ctx.beginPath();
  if (s.kind === 'rect') {
    ctx.rect(s.a.x, s.a.y, s.b.x - s.a.x, s.b.y - s.a.y);
  } else {
    ctx.ellipse((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2, Math.abs(s.b.x - s.a.x) / 2, Math.abs(s.b.y - s.a.y) / 2, 0, 0, Math.PI * 2);
  }
}

function drawStroke(ctx, s) {
  if (s.fillOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = s.fillOpacity;
    ctx.fillStyle = s.fillColor;
    shapePath(ctx, s);
    ctx.fill();
    ctx.restore();
  }
  const opacity = s.opacity ?? 1;
  if (opacity <= 0) return;
  if (opacity >= 1 || s.kind === 'highlighter') {
    drawOutline(ctx, s);
    return;
  }
  // Traço semitransparente: desenha opaco à parte e aplica a transparência de uma vez,
  // para as partes que se sobrepõem (ponta da seta, segmentos da caneta) não ficarem mais escuras.
  sctx.clearRect(0, 0, innerWidth, innerHeight);
  drawOutline(sctx, s);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = opacity;
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

function drawOutline(ctx, s) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.size;
  switch (s.kind) {
    case 'pen':
      drawFree(ctx, s);
      break;
    case 'highlighter':
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = highlightWidth(s.size);
      smoothPath(ctx, s.points);
      ctx.stroke();
      break;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.stroke();
      break;
    case 'arrow':
      drawArrow(ctx, s.a, s.b, s.size);
      break;
    case 'rect':
    case 'ellipse':
      shapePath(ctx, s);
      ctx.stroke();
      break;
    case 'text':
      ctx.font = font(s.fontSize);
      ctx.textBaseline = 'top';
      s.lines.forEach((line, i) => {
        ctx.fillText(line, s.x, s.y + s.fontSize * 0.125 + i * s.fontSize * 1.25);
      });
      break;
  }
  ctx.restore();
}

// Shift: linhas em múltiplos de 45°, quadrados e círculos.
function constrain(a, b, kind, shift) {
  if (!shift) return b;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (kind === 'line' || kind === 'arrow') {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: a.x + Math.cos(angle) * len, y: a.y + Math.sin(angle) * len };
  }
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + Math.sign(dx || 1) * d, y: a.y + Math.sign(dy || 1) * d };
}

// ---------- Borracha ----------

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function outline(s) {
  const { a, b } = s;
  switch (s.kind) {
    case 'pen':
    case 'highlighter':
      return s.points;
    case 'line':
    case 'arrow':
      return [a, b];
    case 'rect':
      return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a];
    case 'ellipse': {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      return Array.from({ length: 49 }, (_, i) => {
        const t = (i / 48) * Math.PI * 2;
        return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
      });
    }
  }
  return [];
}

function hits(s, p, r) {
  if (s.kind === 'text') {
    return p.x >= s.x - r && p.x <= s.x + s.w + r && p.y >= s.y - r && p.y <= s.y + s.h + r;
  }
  // Formas preenchidas também são apagadas ao passar a borracha por dentro.
  if (s.fillOpacity > 0) {
    const cx = (s.a.x + s.b.x) / 2;
    const cy = (s.a.y + s.b.y) / 2;
    const rx = Math.abs(s.b.x - s.a.x) / 2;
    const ry = Math.abs(s.b.y - s.a.y) / 2;
    const dx = Math.abs(p.x - cx);
    const dy = Math.abs(p.y - cy);
    if (s.kind === 'rect' && dx <= rx && dy <= ry) return true;
    if (s.kind === 'ellipse' && rx && ry && (dx / rx) ** 2 + (dy / ry) ** 2 <= 1) return true;
  }
  const reach = r + (s.kind === 'highlighter' ? highlightWidth(s.size) : s.size) / 2;
  const pts = outline(s);
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= reach;
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(p, pts[i - 1], pts[i]) <= reach) return true;
  }
  return false;
}

function eraseAt(p) {
  const r = eraserRadius();
  const keep = strokes.filter((s) => !hits(s, p, r));
  if (keep.length === strokes.length) return;
  // Um arraste inteiro da borracha vira um único passo de desfazer.
  if (erasing.changed) strokes = keep;
  else {
    erasing.changed = true;
    commit(keep);
  }
  redraw();
}

function drawEraserCursor(p) {
  clearLive();
  lctx.save();
  lctx.beginPath();
  lctx.arc(p.x, p.y, eraserRadius(), 0, Math.PI * 2);
  lctx.fillStyle = 'rgba(255,255,255,0.35)';
  lctx.fill();
  lctx.lineWidth = 1.5;
  lctx.strokeStyle = 'rgba(0,0,0,0.7)';
  lctx.stroke();
  lctx.restore();
}

// ---------- Histórico ----------

function commit(next) {
  past.push(strokes);
  if (past.length > HISTORY_LIMIT) past.shift();
  strokes = next;
  future = [];
}

function undo() {
  if (current || !past.length) return;
  future.push(strokes);
  strokes = past.pop();
  redraw();
}

function redo() {
  if (current || !future.length) return;
  past.push(strokes);
  strokes = future.pop();
  redraw();
}

function clearAll() {
  if (editor) cancelText();
  if (!strokes.length) return;
  commit([]);
  redraw();
}

// ---------- Texto ----------

const TEXT_PLACEHOLDER = 'Digite aqui…';

// Caixa de texto: Enter pula linha; conclui com clique fora, Esc, Ctrl+Enter ou o botão ✓.
function openText(p) {
  const ta = document.createElement('textarea');
  ta.className = 'text-editor';
  ta.spellcheck = false;
  ta.rows = 1;
  ta.placeholder = TEXT_PLACEHOLDER;
  Object.assign(ta.style, { left: `${p.x}px`, top: `${p.y}px` });

  const done = document.createElement('button');
  done.className = 'text-done';
  done.textContent = '✓ Concluir';
  done.title = 'Concluir texto (Esc, Ctrl+Enter ou clique fora)';
  // Não deixa o clique no botão tirar o foco da caixa antes de concluir.
  done.addEventListener('pointerdown', (e) => e.preventDefault());
  done.addEventListener('click', () => commitText());

  ta.addEventListener('input', () => editor?.fit());
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      commitText();
    }
  });
  ta.addEventListener('blur', () => commitText());
  document.body.append(ta, done);

  editor = { ta, done, x: p.x, y: p.y, fit: null };
  editor.fit = () => {
    const { fontSize } = editor;
    bctx.save();
    bctx.font = font(fontSize);
    const lines = ta.value ? ta.value.split('\n') : [TEXT_PLACEHOLDER];
    const width = Math.max(...lines.map((l) => bctx.measureText(l).width));
    bctx.restore();
    const w = Math.max(fontSize, width + fontSize);
    ta.style.width = `${w}px`;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    done.style.left = `${p.x + w + 8}px`;
    done.style.top = `${p.y}px`;
  };
  styleText();
  requestAnimationFrame(() => ta.focus());
}

// Aplica tamanho, cor e opacidade atuais à caixa aberta (mudar na barra afeta o texto em edição).
function styleText() {
  if (!editor) return;
  editor.fontSize = TEXT_SIZES[state.textSize] || TEXT_SIZES.medium;
  editor.color = state.color;
  editor.opacity = state.opacity || 1;
  Object.assign(editor.ta.style, {
    font: font(editor.fontSize),
    lineHeight: '1.25',
    color: editor.color,
    opacity: editor.opacity,
  });
  editor.fit();
}

function commitText() {
  if (!editor) return;
  const { ta, done, x, y, fontSize, color, opacity } = editor;
  editor = null;
  ta.remove();
  done.remove();
  const text = ta.value.replace(/\s+$/, '');
  if (!text.trim()) return;
  const lines = text.split('\n');
  bctx.save();
  bctx.font = font(fontSize);
  const w = Math.max(...lines.map((l) => bctx.measureText(l).width));
  bctx.restore();
  const s = { kind: 'text', x, y, lines, fontSize, color, opacity, w, h: lines.length * fontSize * 1.25 };
  commit([...strokes, s]);
  drawStroke(bctx, s);
}

function cancelText() {
  if (!editor) return;
  const { ta, done } = editor;
  editor = null;
  ta.remove();
  done.remove();
}

// ---------- Ponteiro ----------

const point = (e) => ({ x: e.clientX, y: e.clientY, p: e.pressure || 0.5 });

// Pontos intermediários só para caneta/toque: no Windows, o histórico do mouse
// que o Chromium devolve pode vir fora de ordem e gerar laços no traço.
function coalesced(e) {
  const events = e.pointerType !== 'mouse' && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  return events.length ? events : [e];
}

function renderLive() {
  clearLive();
  if (current) drawStroke(lctx, current);
}

live.addEventListener('pointerdown', (e) => {
  if (!state.drawing || (e.button !== 0 && e.button !== 5)) return;
  api.activate();
  const p = point(e);
  if (editor) {
    commitText();
    if (state.tool === 'text') return;
  }
  // Ponta traseira da caneta (borracha) sempre apaga.
  const tool = e.button === 5 || e.buttons & 32 ? 'eraser' : state.tool;
  if (tool === 'text') {
    e.preventDefault();
    openText(p);
    return;
  }
  live.setPointerCapture(e.pointerId);
  if (tool === 'eraser') {
    erasing = { changed: false };
    eraseAt(p);
    drawEraserCursor(p);
    return;
  }
  const isShape = tool === 'rect' || tool === 'ellipse';
  // "Sem borda" só faz sentido em forma com preenchimento; nas outras ferramentas o traço fica opaco.
  const opacity = state.opacity === 0 && !(isShape && state.fillOpacity > 0) ? 1 : state.opacity;
  const base = { kind: tool, color: state.color, size: state.size, opacity };
  if (tool === 'pen' || tool === 'highlighter') {
    current = { ...base, pressure: e.pointerType === 'pen', points: [p] };
  } else if (isShape) {
    current = { ...base, fillColor: state.fillColor, fillOpacity: state.fillOpacity, a: p, b: p };
  } else {
    current = { ...base, a: p, b: p };
  }
  renderLive();
});

live.addEventListener('pointermove', (e) => {
  if (!state.drawing) return;
  if (erasing) {
    for (const ce of coalesced(e)) eraseAt(point(ce));
    drawEraserCursor(point(e));
    return;
  }
  if (!current) {
    if (state.tool === 'eraser') drawEraserCursor(point(e));
    return;
  }
  if (current.points) {
    for (const ce of coalesced(e)) {
      const p = point(ce);
      const last = current.points[current.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= 0.8) current.points.push(p);
    }
  } else {
    current.b = constrain(current.a, point(e), current.kind, e.shiftKey);
  }
  renderLive();
});

function finishStroke() {
  if (erasing) {
    erasing = null;
    return;
  }
  if (!current) return;
  const s = current;
  current = null;
  clearLive();
  if (!s.points && Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) < 3) return;
  commit([...strokes, s]);
  drawStroke(bctx, s);
}

live.addEventListener('pointerup', finishStroke);
live.addEventListener('pointercancel', finishStroke);
live.addEventListener('pointerleave', () => {
  if (!erasing && !current) clearLive();
});

// ---------- Teclado (só com a camada em foco, no modo desenho) ----------

window.addEventListener('keydown', (e) => {
  if (selecting) {
    if (e.key === 'Escape') cancelSelection();
    else if (e.key === 'Enter') endSelection(null);
    return;
  }
  if (editor || !state.drawing) return;
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;

  if (mod && key === 'c') {
    e.preventDefault();
    api.command('copy');
    return;
  }
  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (mod && key === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  if (mod || e.altKey) return;

  if (e.key === 'Escape') api.setState({ drawing: false });
  else if (TOOL_KEYS[key]) api.setState({ tool: TOOL_KEYS[key] });
  else if (/^[1-8]$/.test(e.key)) api.setState({ color: COLORS[Number(e.key) - 1] });
  else if ((e.key === '[' || e.key === ']') && state.tool === 'text') {
    const keys = Object.keys(TEXT_SIZES);
    const i = keys.indexOf(state.textSize);
    api.setState({ textSize: keys[Math.max(0, Math.min(keys.length - 1, i + (e.key === ']' ? 1 : -1)))] });
  } else if (e.key === '[' || e.key === ']') {
    const i = SIZES.indexOf(state.size);
    const next = Math.max(0, Math.min(SIZES.length - 1, (i < 0 ? 1 : i) + (e.key === ']' ? 1 : -1)));
    api.setState({ size: SIZES[next] });
  } else if (key === 'w') api.setState({ background: state.background === 'white' ? 'none' : 'white' });
  else if (key === 'b') api.setState({ background: state.background === 'black' ? 'none' : 'black' });
  else if (e.key === 'Delete' || e.key === 'Backspace') clearAll();
});

// ---------- Seleção de área para o print ----------

const shotEl = document.getElementById('shot');
const shotImg = document.getElementById('shot-img');
const shotMask = document.getElementById('shot-mask');
const shotHint = document.getElementById('shot-hint');
const mctx = shotMask.getContext('2d');
let selecting = null; // { start, rect }

function selectionRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function drawSelection() {
  mctx.clearRect(0, 0, innerWidth, innerHeight);
  mctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  mctx.fillRect(0, 0, innerWidth, innerHeight);
  const r = selecting?.rect;
  if (!r || !r.width || !r.height) return;
  mctx.clearRect(r.x, r.y, r.width, r.height);
  mctx.save();
  mctx.strokeStyle = '#fff';
  mctx.lineWidth = 1.5;
  mctx.setLineDash([6, 4]);
  mctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
  mctx.restore();

  const label = `${Math.round(r.width)} × ${Math.round(r.height)}`;
  mctx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
  const w = mctx.measureText(label).width + 12;
  const ly = r.y > 28 ? r.y - 24 : r.y + r.height + 6;
  mctx.fillStyle = 'rgba(28, 30, 36, 0.92)';
  mctx.fillRect(r.x, ly, w, 20);
  mctx.fillStyle = '#fff';
  mctx.textBaseline = 'middle';
  mctx.fillText(label, r.x + 6, ly + 10);
}

function startSelection({ image, action }) {
  commitText();
  finishStroke();
  clearLive();
  selecting = { start: null, rect: null, action };
  shotImg.src = image;
  const verb = action === 'copy' ? 'Copiar' : 'Salvar';
  shotHint.textContent = `${verb}: arraste para escolher a área · clique ou Enter para a tela inteira · Esc cancela`;
  shotHint.hidden = false;
  shotEl.hidden = false;
  drawSelection();
}

function closeSelection() {
  selecting = null;
  shotEl.hidden = true;
  shotImg.removeAttribute('src');
  mctx.clearRect(0, 0, innerWidth, innerHeight);
}

// Recorta a imagem congelada. rect nulo = tela inteira.
function cropToBlob(rect) {
  const scale = shotImg.naturalWidth / innerWidth;
  const r = rect || { x: 0, y: 0, width: innerWidth, height: innerHeight };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(r.width * scale));
  canvas.height = Math.max(1, Math.round(r.height * scale));
  canvas.getContext('2d').drawImage(shotImg, r.x * scale, r.y * scale, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('falha ao gerar a imagem'))), 'image/png');
  });
}

function endSelection(rect) {
  const png = selecting.action === 'copy' ? cropToBlob(rect) : null;
  closeSelection();
  // Espera a tela congelada sumir antes de o flash aparecer.
  requestAnimationFrame(async () => {
    if (!png) {
      api.regionSelected({ rect });
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      api.regionSelected({ rect, copied: true });
    } catch (err) {
      api.regionSelected({ rect, error: err.message });
    }
  });
}

function cancelSelection() {
  closeSelection();
  api.regionCancel();
  showToast('Print cancelado.');
}

shotMask.addEventListener('pointerdown', (e) => {
  if (!selecting) return;
  if (e.button === 2) {
    cancelSelection();
    return;
  }
  if (e.button !== 0) return;
  shotMask.setPointerCapture(e.pointerId);
  selecting.start = { x: e.clientX, y: e.clientY };
  shotHint.hidden = true;
});

shotMask.addEventListener('pointermove', (e) => {
  if (!selecting?.start) return;
  selecting.rect = selectionRect(selecting.start, { x: e.clientX, y: e.clientY });
  drawSelection();
});

shotMask.addEventListener('pointerup', () => {
  if (!selecting?.start) return;
  const r = selecting.rect;
  endSelection(r && r.width > 4 && r.height > 4 ? r : null);
});

shotMask.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Mensagens do processo principal ----------

let toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 5000);
}

const flashEl = document.getElementById('flash');
function flash() {
  flashEl.classList.remove('go');
  void flashEl.offsetWidth; // reinicia a animação
  flashEl.classList.add('go');
}

api.on('state', (next) => {
  state = next;
  document.body.classList.toggle('drawing', state.drawing);
  document.body.dataset.tool = state.tool;
  document.body.dataset.bg = state.background;
  if (!state.drawing || state.tool !== 'text') {
    commitText();
  } else {
    styleText();
  }
  if (!state.drawing) {
    finishStroke();
    clearLive();
  } else if (state.tool !== 'eraser' && !current) {
    clearLive();
  }
});

api.on('command', (name) => {
  if (name === 'undo') undo();
  else if (name === 'redo') redo();
  else if (name === 'clear') clearAll();
});

api.on('toast', showToast);
api.on('flash', flash);
api.on('select-region', startSelection);
api.on('cancel-region', closeSelection);

window.addEventListener('resize', resize);
resize();
