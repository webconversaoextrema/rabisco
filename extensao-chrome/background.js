// Liga o Rabisco na aba ativa, tira prints e salva arquivos.
// A extensão só acessa a aba em que o Rabisco é ativado (permissão activeTab).

const CONTENT_SCRIPT = 'content/rabisco.js';

// true = já estava na aba; false = acabou de ser injetado; null = página protegida.
async function ensureInjected(tab) {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [CONTENT_SCRIPT] });
      return false;
    } catch {
      warnProtected(tab);
      return null;
    }
  }
}

// Páginas do Chrome (chrome://, Web Store, nova aba) não aceitam extensões.
function warnProtected(tab) {
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#d93a3a' });
  chrome.action.setBadgeText({ tabId: tab.id, text: '✕' });
  chrome.action.setTitle({ tabId: tab.id, title: 'O Chrome não permite o Rabisco nesta página. Abra um site.' });
  setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(() => {}), 4000);
}

chrome.action.onClicked.addListener(async (tab) => {
  // Recém-injetado já abre sozinho; se já estava, alterna mostrar/esconder.
  if (await ensureInjected(tab)) chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-draw') return;
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && (await ensureInjected(tab))) chrome.tabs.sendMessage(tab.id, { type: 'toggle-draw' });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'capture') {
    chrome.tabs
      .captureVisibleTab(sender.tab.windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'download') {
    chrome.downloads
      .download({ url: msg.dataUrl, filename: msg.filename, saveAs: true })
      .then((id) => sendResponse({ ok: true, id }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
  return false;
});
