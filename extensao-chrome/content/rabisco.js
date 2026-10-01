// Rabisco para Chrome: camada de desenho e barra de ferramentas dentro da página.
// O motor de desenho é o mesmo do app (src/renderer/overlay.js), adaptado para
// guardar os traços em coordenadas da página, para acompanharem a rolagem.
(() => {
  if (window.__rabiscoLoaded) return;
  window.__rabiscoLoaded = true;

  // ---------- Constantes ----------

  const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#212121', '#ffffff'];
  const SIZES = [2, 4, 8, 14];
  const TEXT_SIZES = { small: 20, medium: 32, large: 52 };
  const TEXT_SIZE_LABELS = [
    ['small', 'P', 'pequeno', 10],
    ['medium', 'M', 'médio', 13],
    ['large', 'G', 'grande', 17],
  ];
  const STROKE_OPACITIES = [0, 0.25, 0.5, 1]; // 0 = sem borda (só retângulo e elipse)
  const FILL_OPACITIES = [0, 0.25, 0.5, 1]; // 0 = sem preenchimento
  const TOOL_KEYS = { p: 'pen', h: 'highlighter', e: 'eraser', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', t: 'text' };
  const BOARD_CYCLE = { none: 'white', white: 'black', black: 'none' };
  const SAVED_KEYS = ['tool', 'color', 'size', 'textSize', 'opacity', 'fillColor', 'fillOpacity'];
  const HISTORY_LIMIT = 200;
  const TEXT_PLACEHOLDER = 'Digite aqui…';
  const CHECKER = 'conic-gradient(#9a9a9a 25%, #d6d6d6 0 50%, #9a9a9a 0 75%, #d6d6d6 0) 0 0 / 8px 8px';
  const MOD = /Mac/.test(navigator.userAgent) ? 'Cmd' : 'Ctrl';

  // ---------- Estado ----------

  let state = {
    tool: 'pen',
    color: COLORS[0],
    size: 4,
    textSize: 'medium',
    opacity: 1,
    fillColor: '#1e88e5',
    fillOpacity: 0, // 0 = formas sem preenchimento
    drawing: true,
    background: 'none', // none | white | black
  };
  let target = 'stroke'; // o que a paleta pinta: 'fill' ou 'stroke'
  let strokes = []; // em coordenadas da página (acompanham a rolagem)
  let past = [];
  let future = [];
  let current = null; // traço sendo desenhado
  let erasing = null; // { changed } durante um arraste da borracha
  let editor = null; // caixa de texto aberta
  let selecting = null; // seleção de área do print
  let hidden = false;
  let minimized = false;
  let dpr = 1;

  // ---------- Interface (Shadow DOM isola do CSS da página) ----------

  const svg = (body, box = '0 0 24 24') => `<svg viewBox="${box}">${body}</svg>`;
  const ICONS = {
    mouse: '<path d="M6 3l12 7.5-5.5 1.5L10 18z"/>',
    pen: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
    highlighter: '<path d="M9 14l-2 2v3h3l2-2"/><path d="M9 14l7-10 4 3-7 10z"/><path d="M4 21h8"/>',
    eraser: '<path d="M4 15l9-9 6 6-7 7H8z"/><path d="M9 10l6 6"/><path d="M8 19h12"/>',
    line: '<path d="M5 19L19 5"/>',
    arrow: '<path d="M5 19L19 5"/><path d="M10 5h9v9"/>',
    rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
    text: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
    board: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M12 17v3"/><path d="M8 20h8"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    clear: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    minimize: '<path d="M5 12h14"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    logo: '<path d="M3 17c3-5 5-7 7-7s2 4 4 4 4-8 7-8" stroke="#fdd835" stroke-width="2.6"/>',
  };

  const button = (attr, title, icon, cls = '') =>
    `<button ${attr} class="${cls}" title="${title}">${svg(ICONS[icon])}</button>`;

  const TEMPLATE = `
    <div class="layer" id="layer">
      <canvas id="board"></canvas>
      <canvas id="live"></canvas>
    </div>
    <div id="shot" hidden>
      <canvas id="shot-img"></canvas>
      <canvas id="shot-mask"></canvas>
      <div id="shot-hint"></div>
    </div>
    <div id="panel">
      <div class="handle" title="Arraste para mover">${svg('<circle cx="6" cy="4" r="1.5"/><circle cx="12" cy="4" r="1.5"/><circle cx="18" cy="4" r="1.5"/>', '0 0 24 8')}</div>
      <div class="grid">
        ${button('data-tool="mouse"', 'Mouse: clicar e rolar a página (Esc / Alt+Shift+D)', 'mouse')}
        ${button('data-tool="pen"', 'Caneta (P)', 'pen')}
        ${button('data-tool="highlighter"', 'Marca-texto (H)', 'highlighter')}
        ${button('data-tool="eraser"', 'Borracha (E)', 'eraser')}
        ${button('data-tool="line"', 'Linha (L) — Shift trava em 45°', 'line')}
        ${button('data-tool="arrow"', 'Seta (A) — Shift trava em 45°', 'arrow')}
        ${button('data-tool="rect"', 'Retângulo (R) — Shift faz quadrado', 'rect')}
        ${button('data-tool="ellipse"', 'Elipse (O) — Shift faz círculo', 'ellipse')}
        ${button('data-tool="text"', 'Texto (T) — Enter pula linha; Esc, Ctrl+Enter ou clique fora conclui', 'text')}
        ${button('data-cmd="board"', 'Quadro: transparente → branco → negro (W / B)', 'board')}
      </div>
      <div class="sep"></div>
      <div class="targets">
        <button data-target="fill" title="Preenchimento: cor e transparência (retângulo e elipse)"><span class="swatch" id="fill-swatch"></span></button>
        <button data-target="stroke" title="Borda e traço: cor e transparência"><span class="swatch ring" id="stroke-swatch"></span></button>
      </div>
      <div class="colors" id="colors"></div>
      <div class="opacities" id="opacities"></div>
      <div class="sizes" id="sizes"></div>
      <div class="sep"></div>
      <div class="grid">
        ${button('data-cmd="undo"', 'Desfazer (Ctrl+Z)', 'undo')}
        ${button('data-cmd="redo"', 'Refazer (Ctrl+Y)', 'redo')}
        ${button('data-cmd="copy"', 'Copiar print (Ctrl+C) — arraste para escolher a área', 'copy')}
        ${button('data-cmd="screenshot"', 'Salvar print — arraste para escolher a área', 'camera')}
        ${button('data-cmd="clear"', 'Limpar tudo (Delete)', 'clear')}
        ${button('data-cmd="minimize"', 'Minimizar a barra (os desenhos continuam)', 'minimize')}
        ${button('data-cmd="close"', 'Fechar o Rabisco (clique no ícone da extensão para abrir de novo)', 'close', 'danger')}
      </div>
    </div>
    <button id="mini" hidden title="Abrir a barra do Rabisco">${svg(ICONS.logo)}</button>
    <div id="flash"></div>
    <div id="toast" role="status"></div>
  `;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }

    .layer { position: fixed; inset: 0; pointer-events: none; }
    .layer.drawing { pointer-events: auto; cursor: crosshair; }
    .layer.drawing[data-tool="text"] { cursor: text; }
    .layer.drawing[data-tool="eraser"] { cursor: none; }
    .layer[data-bg="white"] { background: #fff; }
    .layer[data-bg="black"] { background: #1f2b24; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }

    .text-editor {
      position: fixed; margin: 0; padding: 0; border: none;
      outline: 1px dashed rgba(128, 128, 128, 0.8); background: transparent;
      resize: none; overflow: hidden; white-space: pre; line-height: 1.25; pointer-events: auto;
    }
    .text-editor::placeholder { color: inherit; opacity: 0.45; }
    .text-done {
      /* Sobrescreve o tamanho fixo dos botões da barra (regra "button" abaixo). */
      width: auto; height: auto; display: block; line-height: normal;
      position: fixed; padding: 5px 10px; border: none; border-radius: 8px;
      background: #3d7cf4; color: #fff; font: 600 13px system-ui, -apple-system, "Segoe UI", sans-serif;
      white-space: nowrap; cursor: pointer; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); pointer-events: auto;
    }
    .text-done:hover { background: #2f6ae0; }

    #shot { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; }
    #shot-hint {
      position: absolute; top: 24px; left: 50%; transform: translateX(-50%);
      padding: 10px 16px; border-radius: 10px; background: rgba(28, 30, 36, 0.92); color: #fff;
      font: 14px system-ui, -apple-system, "Segoe UI", sans-serif; white-space: nowrap; pointer-events: none;
    }

    #panel {
      position: fixed; left: 16px; top: 80px; pointer-events: auto;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 4px 8px 8px; border-radius: 14px; background: #1c1e24;
      border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif; user-select: none;
    }
    .handle { width: 100%; height: 16px; display: flex; justify-content: center; align-items: center; cursor: grab; touch-action: none; }
    .handle svg { width: 24px; height: 8px; fill: rgba(255, 255, 255, 0.45); }
    .grid, .targets { display: grid; grid-template-columns: repeat(2, 38px); gap: 4px; }
    button {
      width: 38px; height: 38px; padding: 0; margin: 0; display: flex; align-items: center; justify-content: center;
      border: none; border-radius: 9px; background: transparent; color: #e8eaef; cursor: pointer; font: inherit;
    }
    button:hover { background: rgba(255, 255, 255, 0.1); }
    button.active { background: #3d7cf4; color: #fff; }
    button.danger:hover { background: #d93a3a; }
    button svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    button[data-cmd="board"][data-bg="white"] svg rect { fill: #fff; }
    button[data-cmd="board"][data-bg="black"] svg rect { fill: #1f2b24; stroke: #9ccc65; }
    .sep { width: 100%; height: 1px; background: rgba(255, 255, 255, 0.18); }
    .targets button { height: 28px; }
    .swatch { display: block; width: 16px; height: 16px; border-radius: 4px; }
    .swatch.ring { border: 4px solid; background: transparent !important; }
    .swatch.none { background: linear-gradient(to top right, transparent 43%, #e53935 43% 57%, transparent 57%), #fff !important; }
    .colors, .opacities, .sizes { display: grid; grid-template-columns: repeat(4, 18px); gap: 5px; }
    .colors button { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.25); }
    .colors button:hover { transform: scale(1.12); }
    .colors button.active { outline: 2px solid #fff; outline-offset: 2px; background-clip: padding-box; }
    .opacities button { width: 18px; height: 18px; border-radius: 50%; }
    .opacities .swatch { width: 14px; height: 14px; border-radius: 50%; }
    .opacities button.active { outline: 2px solid #fff; outline-offset: 1px; background: transparent; }
    .sizes button { width: 18px; height: 22px; border-radius: 5px; }
    .sizes button span { display: block; border-radius: 50%; background: currentColor; }
    .sizes.text { grid-template-columns: repeat(3, 26px); }
    .sizes.text button { width: 26px; font-weight: 700; line-height: 1; }

    #mini {
      position: fixed; width: 44px; height: 44px; border-radius: 50%; pointer-events: auto;
      background: #2a5bd7; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    }
    #mini svg { width: 26px; height: 26px; }

    #flash { position: fixed; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
    #flash.go { animation: flash 0.45s ease-out; }
    @keyframes flash { from { opacity: 0.85; } to { opacity: 0; } }

    #toast {
      position: fixed; left: 50%; bottom: 48px; transform: translateX(-50%); max-width: 80vw;
      padding: 10px 16px; border-radius: 10px; background: rgba(28, 30, 36, 0.92); color: #fff;
      font: 14px system-ui, -apple-system, "Segoe UI", sans-serif; opacity: 0; transition: opacity 0.2s; pointer-events: none;
    }
    #toast.show { opacity: 1; }
  `;

  const host = document.createElement('div');
  host.id = 'rabisco-extensao';
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
  const root = host.attachShadow({ mode: 'open' });
  // Folha construída via CSSOM: não é bloqueada pelo Content-Security-Policy da página.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  root.adoptedStyleSheets = [sheet];
  root.innerHTML = TEMPLATE;
  document.documentElement.appendChild(host);

  const $ = (id) => root.getElementById(id);
  const layer = $('layer');
  const board = $('board');
  const live = $('live');
  const bctx = board.getContext('2d');
  const lctx = live.getContext('2d');
  const scratch = document.createElement('canvas'); // apoio para traços semitransparentes
  const sctx = scratch.getContext('2d');
  const panel = $('panel');
  const mini = $('mini');
  const toastEl = $('toast');
  const flashEl = $('flash');
  const shotEl = $('shot');
  const shotImg = $('shot-img');
  const shotMask = $('shot-mask');
  const shotHint = $('shot-hint');
  const mctx = shotMask.getContext('2d');
  const colorsEl = $('colors');
  const opacitiesEl = $('opacities');
  const sizesEl = $('sizes');
  const strokeSwatch = $('stroke-swatch');
  const fillSwatch = $('fill-swatch');

  // ---------- Tamanhos ----------

  const highlightWidth = (size) => size * 3 + 10;
  const eraserRadius = () => Math.max(8, state.size * 2.5);
  const font = (px) => `600 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  // ---------- Canvas ----------

  function resize() {
    dpr = window.devicePixelRatio || 1;
    for (const canvas of [board, live, scratch, shotMask, shotImg]) {
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
    }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (selecting) {
      drawShotImage();
      drawSelection();
    }
    redraw();
    keepPanelInView();
  }

  // Traços ficam em coordenadas da página; o canvas mostra a parte visível.
  function viewTransform(ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, -scrollX * dpr, -scrollY * dpr);
  }

  function clearCanvas(ctx) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  function redraw() {
    clearCanvas(bctx);
    viewTransform(bctx);
    for (const s of strokes) drawStroke(bctx, s);
  }

  function clearLive() {
    clearCanvas(lctx);
  }

  function renderLive() {
    clearLive();
    if (!current) return;
    viewTransform(lctx);
    drawStroke(lctx, current);
  }

  let redrawQueued = false;
  function onScroll() {
    commitText(); // a caixa de texto fica fixa na tela; conclui antes de rolar
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      redraw();
      renderLive();
    });
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
    clearCanvas(sctx);
    viewTransform(sctx);
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
    viewTransform(lctx);
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

  // Caixa de texto: Enter pula linha; conclui com clique fora, Esc, Ctrl+Enter ou o botão ✓.
  // p está em coordenadas da página; a caixa é posicionada na tela.
  function openText(p) {
    const ta = document.createElement('textarea');
    ta.className = 'text-editor';
    ta.spellcheck = false;
    ta.rows = 1;
    ta.placeholder = TEXT_PLACEHOLDER;
    const left = p.x - scrollX;
    const top = p.y - scrollY;
    Object.assign(ta.style, { left: `${left}px`, top: `${top}px` });

    const done = document.createElement('button');
    done.className = 'text-done';
    done.textContent = '✓ Concluir';
    done.title = 'Concluir texto (Esc, Ctrl+Enter ou clique fora)';
    // Não deixa o clique no botão tirar o foco da caixa antes de concluir.
    done.addEventListener('mousedown', (e) => e.preventDefault());
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
    root.append(ta, done);

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
      done.style.left = `${left + w + 8}px`;
      done.style.top = `${top}px`;
    };
    styleText();
    requestAnimationFrame(() => ta.focus());
  }

  // Aplica tamanho, cor e opacidade atuais à caixa aberta.
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
    redraw();
  }

  function cancelText() {
    if (!editor) return;
    const { ta, done } = editor;
    editor = null;
    ta.remove();
    done.remove();
  }

  // ---------- Ponteiro ----------

  const point = (e) => ({ x: e.clientX + scrollX, y: e.clientY + scrollY, p: e.pressure || 0.5 });

  // Pontos intermediários só para caneta/toque: o histórico do mouse pode vir fora de ordem.
  function coalesced(e) {
    const events = e.pointerType !== 'mouse' && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    return events.length ? events : [e];
  }

  live.addEventListener('pointerdown', (e) => {
    if (!state.drawing || (e.button !== 0 && e.button !== 5)) return;
    e.preventDefault();
    const p = point(e);
    if (editor) {
      commitText();
      if (state.tool === 'text') return;
    }
    // Ponta traseira da caneta (borracha) sempre apaga.
    const tool = e.button === 5 || e.buttons & 32 ? 'eraser' : state.tool;
    if (tool === 'text') {
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
    redraw();
  }

  live.addEventListener('pointerup', finishStroke);
  live.addEventListener('pointercancel', finishStroke);
  live.addEventListener('pointerleave', () => {
    if (!erasing && !current) clearLive();
  });

  // ---------- Print com seleção de área ----------

  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  function dataUrlToBlob(url) {
    const [head, b64] = url.split(',');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: head.match(/:(.*?);/)[1] });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function timestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  }

  function setChromeVisible(visible) {
    panel.hidden = !visible || minimized;
    mini.hidden = !visible || !minimized;
    toastEl.hidden = !visible;
  }

  async function startShot(action) {
    if (selecting) return;
    commitText();
    finishStroke();
    clearLive();
    setChromeVisible(false);
    await nextFrame();
    await nextFrame();
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'capture' });
    } catch (err) {
      res = { error: err.message };
    }
    if (!res?.dataUrl) {
      setChromeVisible(true);
      toast(`Não foi possível capturar a tela: ${res?.error || 'erro desconhecido'}`);
      return;
    }
    // Decodifica sem passar por <img>, que o CSP de alguns sites bloquearia.
    const bitmap = await createImageBitmap(dataUrlToBlob(res.dataUrl));
    selecting = { start: null, rect: null, action, bitmap };
    drawShotImage();
    const verb = action === 'copy' ? 'Copiar' : 'Salvar';
    shotHint.textContent = `${verb}: arraste para escolher a área · clique ou Enter para a tela inteira · Esc cancela`;
    shotHint.hidden = false;
    shotEl.hidden = false;
    drawSelection();
  }

  function drawShotImage() {
    const ctx = shotImg.getContext('2d');
    ctx.drawImage(selecting.bitmap, 0, 0, shotImg.width, shotImg.height);
  }

  function selectionRect(a, b) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
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

  function closeSelection() {
    selecting?.bitmap.close();
    selecting = null;
    shotEl.hidden = true;
    mctx.clearRect(0, 0, innerWidth, innerHeight);
    setChromeVisible(true);
  }

  // Recorta o print. rect nulo = tela inteira.
  function cropToBlob(bitmap, rect) {
    const scale = bitmap.width / innerWidth;
    const r = rect || { x: 0, y: 0, width: innerWidth, height: innerHeight };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(r.width * scale));
    canvas.height = Math.max(1, Math.round(r.height * scale));
    canvas.getContext('2d').drawImage(bitmap, r.x * scale, r.y * scale, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('falha ao gerar a imagem'))), 'image/png');
    });
  }

  function endSelection(rect) {
    const { action, bitmap } = selecting;
    const png = cropToBlob(bitmap, rect);
    if (action === 'copy') {
      // A escrita precisa começar ainda dentro do clique do usuário.
      const writing = navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      closeSelection();
      flash();
      writing.then(
        () => {
          // No modo mouse dá para clicar na página e colar em outro lugar.
          setState({ drawing: false });
          toast(`Print copiado. Modo mouse ativado: cole com ${MOD}+V onde quiser.`);
        },
        (err) => toast(`Este site não deixou copiar (${err.message}). Use o botão de salvar.`),
      );
      return;
    }
    closeSelection();
    flash();
    png
      .then(blobToDataUrl)
      .then((dataUrl) => chrome.runtime.sendMessage({ type: 'download', dataUrl, filename: `rabisco-${timestamp()}.png` }))
      .then((res) => {
        if (res?.ok) toast('Print salvo.');
        else if (res?.error && !/cancel/i.test(res.error)) toast(`Não foi possível salvar: ${res.error}`);
      })
      .catch((err) => toast(`Não foi possível salvar: ${err.message}`));
  }

  function cancelSelection() {
    closeSelection();
    toast('Print cancelado.');
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

  // ---------- Estado e barra ----------

  function setState(partial) {
    Object.assign(state, partial);
    // Escolher uma ferramenta ou um quadro liga o modo desenho.
    if ('tool' in partial) state.drawing = true;
    if (partial.background && partial.background !== 'none') state.drawing = true;
    // Voltar ao mouse com o quadro aberto esconderia a página sem permitir clicá-la.
    if (!state.drawing) state.background = 'none';
    applyState();
    const saved = Object.fromEntries(SAVED_KEYS.map((k) => [k, state[k]]));
    chrome.storage.local.set({ settings: saved }).catch(() => {});
  }

  function applyState() {
    layer.classList.toggle('drawing', state.drawing);
    layer.dataset.tool = state.tool;
    layer.dataset.bg = state.background;
    if (!state.drawing || state.tool !== 'text') commitText();
    else styleText();
    if (!state.drawing) {
      finishStroke();
      clearLive();
    } else if (state.tool !== 'eraser' && !current) {
      clearLive();
    }
    renderToolbar();
  }

  function rgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  // Cor com transparência sobre um xadrez, para a transparência ficar visível.
  function paintSwatch(el, color, opacity) {
    el.classList.toggle('none', opacity === 0);
    el.style.background = opacity === 0 ? '' : `linear-gradient(${rgba(color, opacity)}, ${rgba(color, opacity)}), ${CHECKER}`;
  }

  COLORS.forEach((color, i) => {
    const b = document.createElement('button');
    b.dataset.color = color;
    b.style.background = color;
    b.title = `Cor ${i + 1} (tecla ${i + 1} muda a cor da borda)`;
    colorsEl.appendChild(b);
  });

  function renderOpacities(color, currentValue) {
    opacitiesEl.replaceChildren();
    for (const value of target === 'fill' ? FILL_OPACITIES : STROKE_OPACITIES) {
      const b = document.createElement('button');
      b.dataset.opacity = value;
      const noneLabel = target === 'fill' ? 'Sem preenchimento' : 'Sem borda (retângulo e elipse)';
      b.title = value === 0 ? noneLabel : `${target === 'fill' ? 'Preenchimento' : 'Borda'} com ${value * 100}% de opacidade`;
      b.classList.toggle('active', value === currentValue);
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      paintSwatch(swatch, color, value);
      b.appendChild(swatch);
      opacitiesEl.appendChild(b);
    }
  }

  // Com a ferramenta de texto, a linha de espessura vira tamanhos de texto P / M / G.
  function renderSizes() {
    sizesEl.replaceChildren();
    const isText = state.tool === 'text';
    sizesEl.classList.toggle('text', isText);
    if (isText) {
      for (const [key, label, name, px] of TEXT_SIZE_LABELS) {
        const b = document.createElement('button');
        b.dataset.textSize = key;
        b.title = `Texto ${name} ([ e ] alteram)`;
        b.textContent = label;
        b.style.fontSize = `${px}px`;
        b.classList.toggle('active', state.textSize === key);
        sizesEl.appendChild(b);
      }
      return;
    }
    for (const size of SIZES) {
      const b = document.createElement('button');
      b.dataset.size = size;
      b.title = 'Espessura ([ e ] alteram)';
      b.style.color = state.color;
      b.classList.toggle('active', size === state.size);
      const dot = document.createElement('span');
      dot.style.width = dot.style.height = `${Math.min(16, size + 2)}px`;
      b.appendChild(dot);
      sizesEl.appendChild(b);
    }
  }

  function renderToolbar() {
    const activeTool = state.drawing ? state.tool : 'mouse';
    panel.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === activeTool));
    panel.querySelectorAll('[data-target]').forEach((b) => b.classList.toggle('active', b.dataset.target === target));
    strokeSwatch.style.borderColor = rgba(state.color, state.opacity);
    strokeSwatch.classList.toggle('none', state.opacity === 0);
    paintSwatch(fillSwatch, state.fillColor, state.fillOpacity);

    const color = target === 'fill' ? state.fillColor : state.color;
    const opacity = target === 'fill' ? state.fillOpacity : state.opacity;
    panel.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('active', b.dataset.color === color));
    renderOpacities(color, opacity);
    renderSizes();

    const boardBtn = panel.querySelector('[data-cmd="board"]');
    boardBtn.dataset.bg = state.background;
    boardBtn.classList.toggle('active', state.background !== 'none');
  }

  // Clicar na barra não tira o foco da caixa de texto em edição.
  panel.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const { tool, color, size, cmd, opacity, textSize } = b.dataset;
    if (b.dataset.target) {
      target = b.dataset.target;
      renderToolbar();
    } else if (opacity !== undefined) {
      const value = Number(opacity);
      if (target === 'fill') setState({ fillOpacity: value });
      // Sem borda e sem preenchimento a forma seria invisível: liga o preenchimento.
      else setState({ opacity: value, ...(value === 0 && state.fillOpacity === 0 ? { fillOpacity: 0.5 } : {}) });
    } else if (color) {
      // Escolher uma cor com a opção "sem" ativa já liga em 50%.
      if (target === 'fill') setState({ fillColor: color, ...(state.fillOpacity === 0 ? { fillOpacity: 0.5 } : {}) });
      else setState({ color, ...(state.opacity === 0 ? { opacity: 1 } : {}) });
    } else if (tool === 'mouse') setState({ drawing: false });
    else if (tool) setState({ tool });
    else if (size) setState({ size: Number(size) });
    else if (textSize) setState({ textSize });
    else if (cmd) runCommand(cmd);
  });

  function runCommand(cmd) {
    switch (cmd) {
      case 'board':
        setState({ background: BOARD_CYCLE[state.background] });
        break;
      case 'undo':
        undo();
        break;
      case 'redo':
        redo();
        break;
      case 'clear':
        clearAll();
        break;
      case 'copy':
        startShot('copy');
        break;
      case 'screenshot':
        startShot('save');
        break;
      case 'minimize':
        minimize();
        break;
      case 'close':
        hide();
        break;
    }
  }

  // ---------- Mostrar, esconder, minimizar ----------

  function show() {
    hidden = false;
    host.style.display = '';
    setState({ drawing: true });
  }

  function hide() {
    if (selecting) closeSelection();
    setState({ drawing: false });
    hidden = true;
    host.style.display = 'none';
  }

  function minimize() {
    setState({ drawing: false });
    minimized = true;
    const r = panel.getBoundingClientRect();
    mini.style.left = `${r.left}px`;
    mini.style.top = `${r.top}px`;
    setChromeVisible(true);
  }

  mini.addEventListener('click', () => {
    minimized = false;
    setChromeVisible(true);
    keepPanelInView();
  });

  // ---------- Arrastar a barra ----------

  const handle = panel.querySelector('.handle');
  let drag = null;

  handle.addEventListener('pointerdown', (e) => {
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    placePanel(e.clientX - drag.dx, e.clientY - drag.dy);
  });

  handle.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    const r = panel.getBoundingClientRect();
    chrome.storage.local.set({ panelPos: { left: r.left, top: r.top } }).catch(() => {});
  });

  function placePanel(left, top) {
    const r = panel.getBoundingClientRect();
    const x = Math.max(4, Math.min(innerWidth - r.width - 4, left));
    const y = Math.max(4, Math.min(innerHeight - r.height - 4, top));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  }

  function keepPanelInView() {
    const r = panel.getBoundingClientRect();
    placePanel(r.left, r.top);
  }

  // ---------- Teclado (só no modo desenho) ----------

  const handledKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  window.addEventListener(
    'keydown',
    (e) => {
      if (hidden) return;
      if (selecting) {
        if (e.key === 'Escape') cancelSelection();
        else if (e.key === 'Enter') endSelection(null);
        else return;
        handledKey(e);
        return;
      }
      if (editor || !state.drawing) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && key === 'c') startShot('copy');
      else if (mod && key === 'z') e.shiftKey ? redo() : undo();
      else if (mod && key === 'y') redo();
      else if (mod || e.altKey) return;
      else if (e.key === 'Escape') setState({ drawing: false });
      else if (TOOL_KEYS[key]) setState({ tool: TOOL_KEYS[key] });
      else if (/^[1-8]$/.test(e.key)) setState({ color: COLORS[Number(e.key) - 1] });
      else if ((e.key === '[' || e.key === ']') && state.tool === 'text') {
        const keys = Object.keys(TEXT_SIZES);
        const i = keys.indexOf(state.textSize);
        setState({ textSize: keys[Math.max(0, Math.min(keys.length - 1, i + (e.key === ']' ? 1 : -1)))] });
      } else if (e.key === '[' || e.key === ']') {
        const i = SIZES.indexOf(state.size);
        const next = Math.max(0, Math.min(SIZES.length - 1, (i < 0 ? 1 : i) + (e.key === ']' ? 1 : -1)));
        setState({ size: SIZES[next] });
      } else if (key === 'w') setState({ background: state.background === 'white' ? 'none' : 'white' });
      else if (key === 'b') setState({ background: state.background === 'black' ? 'none' : 'black' });
      else if (e.key === 'Delete' || e.key === 'Backspace') clearAll();
      else return;
      handledKey(e);
    },
    true,
  );

  // ---------- Avisos ----------

  let toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 5000);
  }

  function flash() {
    flashEl.classList.remove('go');
    void flashEl.offsetWidth; // reinicia a animação
    flashEl.classList.add('go');
  }

  // ---------- Mensagens da extensão ----------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'ping') {
      sendResponse(true);
      return;
    }
    if (msg.type === 'toggle') {
      if (hidden) show();
      else hide();
    } else if (msg.type === 'toggle-draw') {
      if (hidden) show();
      else setState({ drawing: !state.drawing });
    }
  });

  // ---------- Início ----------

  window.addEventListener('resize', resize);
  window.addEventListener('scroll', onScroll, { passive: true });
  resize();
  applyState();
  placePanel(16, (innerHeight - panel.getBoundingClientRect().height) / 2);

  chrome.storage.local
    .get(['settings', 'panelPos'])
    .then(({ settings, panelPos }) => {
      if (settings) Object.assign(state, settings);
      applyState();
      if (panelPos) placePanel(panelPos.left, panelPos.top);
    })
    .catch(() => {});

  toast('Rabisco ativo. Esc ou o botão de seta voltam ao mouse; Alt+Shift+D alterna o desenho.');
})();
