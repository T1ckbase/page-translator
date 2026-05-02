import { DEFAULT_SETTINGS, getSettings, languages, populateLanguageSelect, setSelectValue } from './settings.js';
import { getPageState, sendPageMessage } from './frame-messaging.js';

const sourceSelect = document.querySelector('#source-lang');
const targetSelect = document.querySelector('#target-lang');
const status = document.querySelector('#status');
const modeInputs = Array.from(document.querySelectorAll('input[name="mode"]'));

populateLanguageSelect(sourceSelect, languages.sl);
populateLanguageSelect(targetSelect, languages.tl);

let activeTabId = null;
let syncingUi = false;

function setMode(mode) {
  for (const input of modeInputs) {
    input.checked = input.value === mode;
  }
}

function getMode() {
  return modeInputs.find((input) => input.checked)?.value || 'original';
}

function showStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? 'crimson' : '';
}

function setDisabled(disabled) {
  sourceSelect.disabled = disabled;
  targetSelect.disabled = disabled;
  for (const input of modeInputs) {
    input.disabled = disabled;
  }
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active tab found.');
  }

  return tab.id;
}

async function sendControllerMessage(message) {
  return sendPageMessage(activeTabId, message);
}

async function applyTranslationState() {
  const mode = getMode();

  if (mode === 'translated') {
    showStatus('Translating...');
    await sendControllerMessage({
      type: 'pageTranslator:translate',
      sourceLang: sourceSelect.value,
      targetLang: targetSelect.value,
    });
    showStatus('Page translated.');
    return;
  }

  await sendControllerMessage({ type: 'pageTranslator:restore' });
  showStatus('Original page restored.');
}

async function syncPopupState() {
  syncingUi = true;

  try {
    const settings = await getSettings();
    setSelectValue(sourceSelect, settings.sourceLang, DEFAULT_SETTINGS.sourceLang);
    setSelectValue(targetSelect, settings.targetLang, DEFAULT_SETTINGS.targetLang);

    const pageState = await getPageState(activeTabId);

    if (pageState.mode === 'translated') {
      setMode('translated');
      setSelectValue(sourceSelect, pageState.sourceLang || settings.sourceLang, DEFAULT_SETTINGS.sourceLang);
      setSelectValue(targetSelect, pageState.targetLang || settings.targetLang, DEFAULT_SETTINGS.targetLang);
      showStatus(pageState.translating ? 'Translating...' : 'Page is translated.');
    } else {
      setMode('original');
      showStatus('');
    }
  } finally {
    syncingUi = false;
  }
}

async function handleUiChange() {
  if (syncingUi) {
    return;
  }

  setDisabled(true);

  try {
    await applyTranslationState();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : 'This page cannot be translated.', true);
  } finally {
    setDisabled(false);
  }
}

for (const input of modeInputs) {
  input.addEventListener('change', handleUiChange);
}

sourceSelect.addEventListener('change', handleUiChange);
targetSelect.addEventListener('change', handleUiChange);

setDisabled(true);

try {
  activeTabId = await getActiveTabId();
  await syncPopupState();
  setDisabled(false);
} catch (error) {
  setDisabled(true);
  showStatus(error instanceof Error ? error.message : 'This page cannot be translated.', true);
}
