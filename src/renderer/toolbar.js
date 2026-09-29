const api = window.rabisco;
const { COLORS, SIZES, STROKE_OPACITIES, FILL_OPACITIES } = window.RABISCO;

const BOARD_CYCLE = { none: 'white', white: 'black', black: 'none' };
const CHECKER = 'conic-gradient(#9a9a9a 25%, #d6d6d6 0 50%, #9a9a9a 0 75%, #d6d6d6 0) 0 0 / 8px 8px';

let state = null;
let target = 'stroke'; // o que a paleta pinta: 'fill' (preenchimento) ou 'stroke' (borda e traço)

function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Cor com transparência sobre um xadrez, para a transparência ficar visível.
function paintSwatch(el, color, opacity) {
  el.classList.toggle('none', opacity === 0);
  el.style.background = opacity === 0 ? '' : `linear-gradient(${rgba(color, opacity)}, ${rgba(color, opacity)}), ${CHECKER}`;
}

const colorsEl = document.getElementById('colors');
COLORS.forEach((color, i) => {
  const b = document.createElement('button');
  b.dataset.color = color;
  b.style.background = color;
  b.title = `Cor ${i + 1} (tecla ${i + 1} muda a cor do contorno)`;
  colorsEl.appendChild(b);
});

const sizesEl = document.getElementById('sizes');
SIZES.forEach((size) => {
  const b = document.createElement('button');
  b.dataset.size = size;
  b.title = 'Espessura ([ e ] alteram)';
  const dot = document.createElement('span');
  const d = Math.min(16, size + 2);
  dot.style.width = dot.style.height = `${d}px`;
  b.appendChild(dot);
  sizesEl.appendChild(b);
});

const opacitiesEl = document.getElementById('opacities');
const strokeSwatch = document.getElementById('stroke-swatch');
const fillSwatch = document.getElementById('fill-swatch');

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !state) return;
  const { tool, color, size, cmd, opacity } = b.dataset;
  if (b.dataset.target) {
    target = b.dataset.target;
    render();
  } else if (opacity !== undefined) {
    const value = Number(opacity);
    if (target === 'fill') api.setState({ fillOpacity: value });
    // Sem borda e sem preenchimento a forma seria invisível: liga o preenchimento.
    else api.setState({ opacity: value, ...(value === 0 && state.fillOpacity === 0 ? { fillOpacity: 0.5 } : {}) });
  } else if (color) {
    // Escolher uma cor com a opção "sem" ativa já liga em 50%.
    if (target === 'fill') {
      api.setState({ fillColor: color, ...(state.fillOpacity === 0 ? { fillOpacity: 0.5 } : {}) });
    } else {
      api.setState({ color, ...(state.opacity === 0 ? { opacity: 1 } : {}) });
    }
  } else if (tool === 'mouse') api.setState({ drawing: false });
  else if (tool) api.setState({ tool });
  else if (size) api.setState({ size: Number(size) });
  else if (cmd === 'board') api.setState({ background: BOARD_CYCLE[state.background] });
  else if (cmd) api.command(cmd);
});

function renderOpacities(color, current) {
  opacitiesEl.replaceChildren();
  for (const value of target === 'fill' ? FILL_OPACITIES : STROKE_OPACITIES) {
    const b = document.createElement('button');
    b.dataset.opacity = value;
    const noneLabel = target === 'fill' ? 'Sem preenchimento' : 'Sem borda (retângulo e elipse)';
    b.title = value === 0 ? noneLabel : `${target === 'fill' ? 'Preenchimento' : 'Borda'} com ${value * 100}% de opacidade`;
    b.classList.toggle('active', value === current);
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    paintSwatch(swatch, color, value);
    b.appendChild(swatch);
    opacitiesEl.appendChild(b);
  }
}

function render() {
  const activeTool = state.drawing ? state.tool : 'mouse';
  document.querySelectorAll('[data-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === activeTool);
  });

  document.querySelectorAll('[data-target]').forEach((b) => {
    b.classList.toggle('active', b.dataset.target === target);
  });
  strokeSwatch.style.borderColor = rgba(state.color, state.opacity);
  strokeSwatch.classList.toggle('none', state.opacity === 0);
  paintSwatch(fillSwatch, state.fillColor, state.fillOpacity);

  const color = target === 'fill' ? state.fillColor : state.color;
  const opacity = target === 'fill' ? state.fillOpacity : state.opacity;
  document.querySelectorAll('[data-color]').forEach((b) => {
    b.classList.toggle('active', b.dataset.color === color);
  });
  renderOpacities(color, opacity);

  document.querySelectorAll('[data-size]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.size) === state.size);
    b.style.color = state.color;
  });

  const board = document.querySelector('[data-cmd="board"]');
  board.dataset.bg = state.background;
  board.classList.toggle('active', state.background !== 'none');
}

api.on('state', (next) => {
  state = next;
  render();
});

// A janela se ajusta ao tamanho real do painel.
const panel = document.getElementById('panel');
const report = () => {
  const r = panel.getBoundingClientRect();
  api.resizeToolbar(r.width, r.height);
};
new ResizeObserver(report).observe(panel);
report();
