import { DEFAULT_SETTINGS, getSettings, getTargetLanguageLabel } from './settings.js';

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

async function ensureController(tabId) {
  let state;

  try {
    state = await chrome.tabs.sendMessage(tabId, { type: 'pageTranslator:getState' });
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js'],
    });

    state = await chrome.tabs.sendMessage(tabId, { type: 'pageTranslator:getState' });
  }

  if (state?.error) {
    throw new Error(state.error);
  }
}

async function translateTab(tabId) {
  const settings = await getSettings();
  await ensureController(tabId);
  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'pageTranslator:translate',
    sourceLang: settings.sourceLang,
    targetLang: settings.targetLang,
  });

  if (response?.error) {
    throw new Error(response.error);
  }
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
