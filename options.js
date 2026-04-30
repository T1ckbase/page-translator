import {
  DEFAULT_SETTINGS,
  getSettings,
  languages,
  populateLanguageSelect,
  saveSettings,
  setSelectValue,
} from './settings.js';

const form = document.querySelector('#options-form');
const sourceSelect = document.querySelector('#source-lang');
const targetSelect = document.querySelector('#target-lang');
const status = document.querySelector('#status');

populateLanguageSelect(sourceSelect, languages.sl);
populateLanguageSelect(targetSelect, languages.tl);

function showStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? 'crimson' : '';
}

async function loadOptions() {
  const settings = await getSettings();
  setSelectValue(sourceSelect, settings.sourceLang, DEFAULT_SETTINGS.sourceLang);
  setSelectValue(targetSelect, settings.targetLang, DEFAULT_SETTINGS.targetLang);
}

async function persistOptions() {
  form.ariaBusy = 'true';

  try {
    await saveSettings({
      sourceLang: sourceSelect.value,
      targetLang: targetSelect.value,
    });
    showStatus('Options saved.');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : 'Failed to save options.', true);
  } finally {
    form.ariaBusy = 'false';
  }
}

sourceSelect.addEventListener('change', persistOptions);
targetSelect.addEventListener('change', persistOptions);

try {
  await loadOptions();
} catch (error) {
  showStatus(error instanceof Error ? error.message : 'Failed to load options.', true);
}
