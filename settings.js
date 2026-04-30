import languages from './languages.js';

export const DEFAULT_SETTINGS = {
  sourceLang: 'auto',
  targetLang: 'en',
};

export { languages };

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
  };
}

export async function saveSettings(partialSettings) {
  const settings = {
    ...(await getSettings()),
    ...partialSettings,
  };

  await chrome.storage.sync.set(settings);
  return settings;
}

export function populateLanguageSelect(select, entries) {
  const fragment = document.createDocumentFragment();

  for (const [value, label] of Object.entries(entries)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    fragment.appendChild(option);
  }

  select.textContent = '';
  select.appendChild(fragment);
}

export function setSelectValue(select, value, fallbackValue) {
  const hasValue = Array.from(select.options).some((option) => option.value === value);
  select.value = hasValue ? value : fallbackValue;
  return select.value;
}

export function getTargetLanguageLabel(targetLang) {
  return languages.tl[targetLang] || targetLang;
}
