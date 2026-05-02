const STATE_MESSAGE = { type: 'pageTranslator:getState' };

function getFrameIds(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return [0];
  }

  return frames
    .filter((frame) => Number.isInteger(frame.frameId) && frame.frameId >= 0 && !frame.errorOccurred)
    .sort((a, b) => a.frameId - b.frameId)
    .map((frame) => frame.frameId);
}

async function listFrameIds(tabId) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  return getFrameIds(frames);
}

async function sendFrameMessage(tabId, frameId, message) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message, { frameId });

    if (response?.error) {
      return { frameId, error: new Error(response.error) };
    }

    return { frameId, response };
  } catch (error) {
    return { frameId, error };
  }
}

async function sendMessageToFrames(tabId, frameIds, message) {
  return Promise.all(frameIds.map((frameId) => sendFrameMessage(tabId, frameId, message)));
}

function getSuccessfulResponses(results) {
  return results.filter((result) => result.response && !result.error);
}

function getReferenceState(states) {
  return states.find((state) => state.mode === 'translated') || states[0] || null;
}

function aggregateStates(results) {
  const states = getSuccessfulResponses(results).map((result) => result.response);

  if (states.length === 0) {
    throw new Error('This page cannot be translated.');
  }

  const translatedStates = states.filter((state) => state.mode === 'translated');
  const referenceState = getReferenceState(states);

  return {
    mode: translatedStates.length > 0 ? 'translated' : 'original',
    sourceLang: referenceState?.sourceLang || null,
    targetLang: referenceState?.targetLang || null,
    translating: states.some((state) => state.translating),
    translatedNodes: states.reduce((sum, state) => sum + (state.translatedNodes || 0), 0),
    translatedFrames: translatedStates.length,
    frameCount: states.length,
  };
}

async function queryControllerStates(tabId, frameIds) {
  return sendMessageToFrames(tabId, frameIds, STATE_MESSAGE);
}

export async function ensureControllers(tabId) {
  const frameIds = await listFrameIds(tabId);
  let results = await queryControllerStates(tabId, frameIds);

  if (getSuccessfulResponses(results).length > 0) {
    return { frameIds, results };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content-script.js'],
    });
  } catch (_error) {
    // Static all-frame injection should already cover most pages.
  }

  results = await queryControllerStates(tabId, frameIds);

  if (getSuccessfulResponses(results).length === 0) {
    throw new Error('This page cannot be translated.');
  }

  return { frameIds, results };
}

export async function getPageState(tabId) {
  const { results } = await ensureControllers(tabId);
  return aggregateStates(results);
}

export async function sendPageMessage(tabId, message) {
  const { frameIds } = await ensureControllers(tabId);
  const results = await sendMessageToFrames(tabId, frameIds, message);
  return aggregateStates(results);
}
