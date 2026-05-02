import { DEFAULT_SETTINGS, getSettings, getTargetLanguageLabel } from './settings.js';
import { sendPageMessage } from './frame-messaging.js';

const MENU_ID = 'translate';

function updateLastError() {
  if (chrome.runtime.lastError) {
    console.warn(chrome.runtime.lastError.message);
  }
}

async function updateContextMenuTitle(targetLang) {
  const title = `Translate to ${getTargetLanguageLabel(targetLang)}`;

  chrome.contextMenus.update(MENU_ID, { title }, updateLastError);
}

async function refreshContextMenuTitle() {
  const settings = await getSettings();
  await updateContextMenuTitle(settings.targetLang);
}

async function ensureDefaultSettings() {
  const settings = await getSettings();

  await chrome.storage.sync.set({
    sourceLang: settings.sourceLang || DEFAULT_SETTINGS.sourceLang,
    targetLang: settings.targetLang || DEFAULT_SETTINGS.targetLang,
  });
}

async function translateTab(tabId) {
  const settings = await getSettings();
  await sendPageMessage(tabId, {
    type: 'pageTranslator:translate',
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultSettings();

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: 'Translate to English',
        contexts: ['page'],
      },
      async () => {
        updateLastError();
        await refreshContextMenuTitle();
      },
    );
  });
});

chrome.runtime.onStartup.addListener(() => {
  refreshContextMenuTitle().catch((error) => {
    console.error('Failed to refresh context menu title.', error);
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !changes.targetLang) {
    return;
  }

  updateContextMenuTitle(changes.targetLang.newValue || DEFAULT_SETTINGS.targetLang).catch((error) => {
    console.error('Failed to update context menu title.', error);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) {
    return;
  }

  translateTab(tab.id).catch((error) => {
    console.error('Failed to translate page from context menu.', error);
  });
});
