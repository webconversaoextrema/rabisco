const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const isMac = process.platform === 'darwin';
const PRELOAD = path.join(__dirname, 'preload.js');
const ICON = path.join(__dirname, 'assets', 'icon.png');

const SHORTCUTS = {
  toggleDrawing: 'CommandOrControl+Shift+D',
  clear: 'CommandOrControl+Shift+X',
  toggleToolbar: 'CommandOrControl+Shift+H',
};

// Estado compartilhado entre a barra de ferramentas e as camadas de desenho.
const state = {
  tool: 'pen',
  color: '#e53935',
  size: 4,
  textSize: 'medium', // small | medium | large
  opacity: 1,
  fillColor: '#1e88e5',
  fillOpacity: 0, // 0 = formas sem preenchimento
  drawing: false,
  background: 'none', // none | white | black
};

let toolbar = null;
let tray = null; // precisa de referência global para o ícone não sumir
const overlays = new Map(); // display.id -> BrowserWindow
let lastOverlay = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------- Janelas ----------

function createOverlay(display) {
  const win = new BrowserWindow({
    ...display.bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    enableLargerThanScreen: true,
    show: false,
    webPreferences: { preload: PRELOAD },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  win.once('ready-to-show', () => {
    win.setBounds(display.bounds);
    win.showInactive();
    applyMode(win);
    raiseToolbar();
  });
  win.webContents.on('did-finish-load', () => win.webContents.send('state', state));
  // No Windows, a janela focada sobe para o topo; a barra precisa continuar acima dela.
  win.on('focus', raiseToolbar);
  win.on('closed', () => {
    overlays.delete(display.id);
    if (lastOverlay === win) lastOverlay = null;
  });
  overlays.set(display.id, win);
}

function createOverlays() {
  for (const win of overlays.values()) win.destroy();
  overlays.clear();
  for (const display of screen.getAllDisplays()) createOverlay(display);
}

function createToolbar() {
  const area = screen.getPrimaryDisplay().workArea;
  toolbar = new BrowserWindow({
    width: 100,
    height: 560,
    x: area.x + 16,
    y: area.y + Math.max(0, Math.round((area.height - 560) / 2)),
    title: 'Rabisco',
    icon: ICON,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    // No Windows, clicar na barra não tira o foco do app que está sendo apresentado.
    focusable: isMac,
    show: false,
    webPreferences: { preload: PRELOAD },
  });
  toolbar.setAlwaysOnTop(true, 'screen-saver', 1);
  toolbar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  toolbar.loadFile(path.join(__dirname, 'renderer', 'toolbar.html'));
  toolbar.webContents.on('did-finish-load', () => toolbar.webContents.send('state', state));
  toolbar.once('ready-to-show', () => toolbar.showInactive());
  toolbar.on('closed', () => {
    toolbar = null;
    app.quit();
  });
}

function raiseToolbar() {
  if (toolbar && toolbar.isVisible()) toolbar.moveTop();
}

function overlayUnderCursor() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return overlays.get(display.id) || overlays.values().next().value;
}

function activeOverlay() {
  return lastOverlay && !lastOverlay.isDestroyed() ? lastOverlay : overlayUnderCursor();
}

// ---------- Modo desenho / modo mouse ----------

function applyMode(win) {
  // Durante a seleção de área do print, a camada precisa receber o mouse.
  if (state.drawing || (shot && shot.overlay === win)) {
    win.setIgnoreMouseEvents(false);
  } else {
    // Cliques atravessam a camada e chegam aos apps por baixo.
    win.setIgnoreMouseEvents(true, { forward: true });
  }
}

function focusOverlay() {
  const win = overlayUnderCursor();
  if (!win) return;
  if (isMac) app.focus({ steal: true });
  win.focus();
  lastOverlay = win;
  raiseToolbar();
}

function broadcast() {
  for (const win of overlays.values()) win.webContents.send('state', state);
  if (toolbar) toolbar.webContents.send('state', state);
}

function setState(partial) {
  const wasDrawing = state.drawing;
  Object.assign(state, partial);

  // Escolher uma ferramenta ou um quadro liga o modo desenho.
  if ('tool' in partial) state.drawing = true;
  if (partial.background && partial.background !== 'none') state.drawing = true;
  // Voltar ao mouse com o quadro aberto esconderia os apps por baixo sem permitir clicá-los.
  if (!state.drawing) state.background = 'none';

  for (const win of overlays.values()) applyMode(win);
  broadcast();
  if (state.drawing && !wasDrawing) focusOverlay();
  raiseToolbar();
}

function sendToAll(channel, ...args) {
  for (const win of overlays.values()) win.webContents.send(channel, ...args);
}

// ---------- Comandos ----------

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch {
    // Não salvar a preferência não impede o uso do app.
  }
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// Print em andamento: { action: 'save' | 'copy', overlay, image, toolbarWasVisible }.
let shot = null;

// Congela o monitor onde está o mouse e deixa escolher a área a capturar.
async function startShot(action) {
  if (shot) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const overlay = overlays.get(display.id);
  if (!overlay) return;
  const toolbarWasVisible = Boolean(toolbar && toolbar.isVisible());
  if (toolbarWasVisible) toolbar.hide();
  shot = { action, overlay, toolbarWasVisible, image: null };

  try {
    await new Promise((r) => setTimeout(r, 250));
    const thumbnailSize = {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
    const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
    if (!source) throw new Error('nenhuma tela disponível');
    shot.image = source.thumbnail;
  } catch (err) {
    toast(`Não foi possível capturar a tela: ${err.message}`);
    endShot();
    return;
  }

  applyMode(overlay);
  if (isMac) app.focus({ steal: true });
  overlay.focus();
  overlay.webContents.send('select-region', { image: shot.image.toDataURL(), action });
}

function endShot() {
  if (!shot) return;
  const { overlay, toolbarWasVisible } = shot;
  shot = null;
  if (!overlay.isDestroyed()) applyMode(overlay);
  if (toolbarWasVisible && toolbar) {
    toolbar.showInactive();
    raiseToolbar();
  }
  if (state.drawing) focusOverlay();
}

// result: { rect, copied, error }. rect nulo = tela inteira.
// A cópia é feita pela própria camada, que já tem a imagem congelada.
async function finishShot(result) {
  if (!shot || !shot.image) return;
  const { action, overlay } = shot;
  try {
    if (action === 'copy') {
      if (result.copied) {
        overlay.webContents.send('flash');
        // No modo mouse os cliques atravessam a camada, então dá para colar em outro programa.
        if (state.drawing) setState({ drawing: false });
        toast(`Print copiado. Modo mouse ativado: clique onde quer colar e use ${isMac ? 'Cmd' : 'Ctrl'}+V.`);
      } else {
        toast(`Não foi possível copiar o print: ${result.error}`);
      }
      return;
    }

    let image = shot.image;
    const { rect } = result;
    if (rect) {
      const { width, height } = image.getSize();
      const scale = width / overlay.getBounds().width;
      const x = Math.max(0, Math.round(rect.x * scale));
      const y = Math.max(0, Math.round(rect.y * scale));
      image = image.crop({
        x,
        y,
        width: Math.max(1, Math.min(width - x, Math.round(rect.width * scale))),
        height: Math.max(1, Math.min(height - y, Math.round(rect.height * scale))),
      });
    }
    overlay.webContents.send('flash');
    await saveImage(overlay, image.toPNG());
  } catch (err) {
    toast(`Erro no print: ${err.message}`);
  } finally {
    // Aconteça o que acontecer, a barra volta e a tela volta a aceitar cliques.
    endShot();
  }
}

async function saveImage(overlay, image) {
  const settings = loadSettings();
  let dir = settings.screenshotDir;
  if (!dir || !fs.existsSync(dir)) {
    dir = path.join(app.getPath('pictures'), 'Rabisco');
    fs.mkdirSync(dir, { recursive: true });
  }
  const { canceled, filePath } = await dialog.showSaveDialog(overlay, {
    title: 'Salvar print da tela',
    defaultPath: path.join(dir, `rabisco-${timestamp()}.png`),
    buttonLabel: 'Salvar',
    filters: [{ name: 'Imagem PNG', extensions: ['png'] }],
  });

  if (canceled || !filePath) {
    toast('Print descartado.');
  } else {
    try {
      fs.writeFileSync(filePath, image);
      saveSettings({ ...settings, screenshotDir: path.dirname(filePath) });
      toast(`Print salvo em ${filePath}`);
    } catch (err) {
      toast(`Não foi possível salvar o print: ${err.message}`);
    }
  }
}

function toast(message) {
  const win = overlayUnderCursor();
  if (win) win.webContents.send('toast', message);
}

function showToolbar() {
  if (!toolbar) return;
  toolbar.showInactive();
  raiseToolbar();
}

let minimizeHintShown = false;

// Esconde a barra; ela volta pelo ícone perto do relógio (bandeja do sistema).
function minimizeToolbar() {
  if (!toolbar) return;
  if (state.drawing) setState({ drawing: false });
  toolbar.hide();
  if (!minimizeHintShown) {
    minimizeHintShown = true;
    const where = isMac ? 'na barra de menus' : 'perto do relógio (se não aparecer, clique na setinha ^)';
    toast(`O Rabisco continua aberto ${where}. Clique no ícone ou use Ctrl+Shift+H para voltar.`);
  }
}

function toggleToolbar() {
  if (!toolbar) return;
  if (toolbar.isVisible()) toolbar.hide();
  else showToolbar();
}

function createTray() {
  const image = nativeImage.createFromPath(ICON).resize({ width: isMac ? 18 : 32, height: isMac ? 18 : 32, quality: 'best' });
  tray = new Tray(image);
  tray.setToolTip('Rabisco');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mostrar barra', click: showToolbar },
      { label: 'Ligar/desligar desenho (Ctrl+Shift+D)', click: () => setState({ drawing: !state.drawing }) },
      { label: 'Limpar desenhos', click: () => runCommand('clear') },
      { type: 'separator' },
      { label: 'Sair do Rabisco', click: () => app.quit() },
    ]),
  );
  // No Windows, o clique esquerdo mostra/esconde a barra; o direito abre o menu.
  if (!isMac) tray.on('click', toggleToolbar);
}

function runCommand(name) {
  switch (name) {
    case 'undo':
    case 'redo':
      activeOverlay()?.webContents.send('command', name);
      break;
    case 'clear':
      sendToAll('command', 'clear');
      break;
    case 'screenshot':
      startShot('save');
      break;
    case 'copy':
      startShot('copy');
      break;
    case 'minimize':
      minimizeToolbar();
      break;
    case 'quit':
      app.quit();
      break;
  }
  // Os prints devolvem o foco sozinhos quando terminam.
  // Os prints devolvem o foco sozinhos quando terminam.
  if (state.drawing && !['quit', 'screenshot', 'copy'].includes(name)) focusOverlay();
}

// ---------- IPC ----------

ipcMain.on('set-state', (_e, partial) => setState(partial));
ipcMain.on('command', (_e, name) => runCommand(name));
ipcMain.on('region-selected', (_e, rect) => finishShot(rect));
ipcMain.on('region-cancel', endShot);
ipcMain.on('overlay-active', (e) => {
  lastOverlay = BrowserWindow.fromWebContents(e.sender);
});
ipcMain.on('toolbar-size', (_e, { width, height }) => {
  if (toolbar) toolbar.setContentSize(Math.ceil(width), Math.ceil(height));
});

// ---------- Ciclo de vida ----------

function registerShortcuts() {
  const actions = {
    toggleDrawing: () => {
      // Saída de emergência se a seleção de área ficar presa.
      if (shot) {
        shot.overlay.webContents.send('cancel-region');
        endShot();
        return;
      }
      setState({ drawing: !state.drawing });
    },
    clear: () => runCommand('clear'),
    toggleToolbar,
  };
  const failed = Object.entries(SHORTCUTS)
    .filter(([key, accel]) => !globalShortcut.register(accel, actions[key]))
    .map(([, accel]) => accel);
  if (failed.length) {
    setTimeout(() => toast(`Atalho em uso por outro programa: ${failed.join(', ')}`), 1500);
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('br.com.rabisco.app');

  createOverlays();
  createToolbar();
  createTray();
  registerShortcuts();

  screen.on('display-added', createOverlays);
  screen.on('display-removed', createOverlays);
  screen.on('display-metrics-changed', (_e, display) => {
    overlays.get(display.id)?.setBounds(display.bounds);
  });
});

app.on('second-instance', showToolbar);

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
