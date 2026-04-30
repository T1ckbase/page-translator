chrome.runtime.onInstalled.addListener(async () => {
  // const url = 'https://translate.googleapis.com/translate_a/l?client=chrome';
  //
  // try {
  //   const response = await fetch(url);
  //
  //   if (!response.ok) {
  //     throw new Error(`HTTP error! status: ${response.status}`);
  //   }
  //
  //   const data = await response.json();
  //
  //   chrome.storage.local.set({ languages: data }, () => {
  //     console.log('Languages has been successfully saved:', data);
  //   });
  // } catch (error) {
  //   console.error('Failed to fetch initialization data:', error);
  // }

  chrome.contextMenus.create({
    id: 'translate',
    title: 'Translate to XXX',
    contexts: ['page'],
  });
});
