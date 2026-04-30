import languages from './languages.json' with { type: 'json' };

{
  const fragment = document.createDocumentFragment();
  for (const [value, label] of Object.entries(languages.sl)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    fragment.appendChild(option);
  }

  document.querySelector('#source-lang').appendChild(fragment);
}

{
  const fragment = document.createDocumentFragment();
  for (const [value, label] of Object.entries(languages.tl)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    fragment.appendChild(option);
  }

  document.querySelector('#target-lang').appendChild(fragment);
}

// On target language change
await chrome.contextMenus.update('trnaslate', { title: `Translate to ${'new language'}` }); // TODO
