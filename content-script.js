/**
 * @typedef {Object} GoogleTranslatorOptions
 * @property {number} [maxChars=4500]
 */

/**
 * @typedef {Object} DetectionResult
 * @property {string} language
 * @property {number} confidence
 */

/**
 * @typedef {Object} TranslationProgress
 * @property {number} group
 * @property {number} totalGroups
 * @property {number} percent
 * @property {number} nodes
 */

/**
 * @typedef {Object} TranslationCompleteResult
 * @property {number} totalNodes
 * @property {string} sourceLang
 * @property {string} targetLang
 */

/**
 * @typedef {Object} PageTranslatorOptions
 * @property {(progress: TranslationProgress) => void} [onProgress]
 * @property {(result: TranslationCompleteResult) => void} [onComplete]
 * @property {(error: unknown) => void} [onError]
 */

/**
 * @typedef {Object} TextItem
 * @property {'text'|'attr'} type
 * @property {Text | Element} node
 * @property {string} text
 * @property {string} [attr]
 */

/**
 * @typedef {Object} TranslationRequestResult
 * @property {unknown[]} data
 * @property {string[]} segments
 * @property {boolean} isArrayInput
 */

/** @type {string} */
const API_KEY = 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520';
/** @type {string} */
const ENDPOINT = 'https://translate-pa.googleapis.com/v1/translateHtml';
const RTL_LANGUAGES = new Set([
  'ar',
  'he',
  'fa',
  'ur',
  'yi',
  'ps',
  'sd',
  'ky',
  'kk',
  'ug',
  'mn',
  'tg',
  'tk',
  'uz',
  'az',
  'bn',
  'pa',
  'gu',
  'ml',
  'ta',
  'te',
  'kn',
  'or',
  'mr',
  'ne',
  'si',
  'am',
  'ti',
]);
const NEVER_TRANSLATE_TAGS = new Set([
  'APPLET',
  'AREA',
  'BASE',
  'FRAME',
  'FRAMESET',
  'HR',
  'LINK',
  'META',
  'NOFRAMES',
  'NOSCRIPT',
  'INPUT',
  'TEXTAREA',
  'TITLE',
]);
const EMPTY_TRANSLATION_TAGS = new Set([
  'BR',
  'CODE',
  'IMG',
  'KBD',
  'MAP',
  'OBJECT',
  'PARAM',
  'RP',
  'SCRIPT',
  'STYLE',
  'WBR',
  'SVG',
]);
const DIRECTION_STYLE_ID = 'page-translator-direction-styles';

function ensureDirectionStyles() {
  if (document.getElementById(DIRECTION_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = DIRECTION_STYLE_ID;
  style.textContent = [
    '.translated-ltr {',
    '  direction: ltr;',
    '  text-align: left;',
    '}',
    '.translated-rtl {',
    '  direction: rtl;',
    '  text-align: right;',
    '}',
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);
}

/**
 * Lightweight translator client for the `translateHtml` endpoint.
 */
class GoogleTranslator {
  /**
   * @param {GoogleTranslatorOptions} [options]
   */
  constructor(options = {}) {
    this.options = {
      maxChars: options.maxChars || 4500,
      ...options,
    };
    this.cache = new Map();
  }

  /**
   * @param {string} text
   * @param {string} [sourceLang='auto']
   * @param {string} [targetLang='en']
   * @returns {Promise<string>}
   */
  async translate(text, sourceLang = 'auto', targetLang = 'en') {
    if (!text || !text.trim()) return '';

    const cacheKey = `${text}:${sourceLang}:${targetLang}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const result = /** @type {string} */ (await this.translateApi(text, sourceLang, targetLang));
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * translateHtml API format:
   * Request: [[["text1","text2"], "sourceLang", "targetLang"], "wt_lib"]
   * Response: [["trans1","trans2"], ["detectedLang1", "detectedLang2"]]
   *
   * @param {string | string[]} text
   * @param {string} sourceLang
   * @param {string} targetLang
   * @returns {Promise<TranslationRequestResult>}
   */
  async requestTranslate(text, sourceLang, targetLang) {
    const segments = Array.isArray(text) ? text : this.buildSegments(text);

    const requestBody = [[segments, sourceLang, targetLang], 'wt_lib'];

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'X-goog-api-key': API_KEY,
        'Content-Type': 'application/json+protobuf',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    return {
      data,
      segments,
      isArrayInput: Array.isArray(text),
    };
  }

  /**
   * @param {string | string[]} text
   * @param {string} sourceLang
   * @param {string} targetLang
   * @returns {Promise<string | string[]>}
   */
  async translateApi(text, sourceLang, targetLang) {
    const { data, isArrayInput } = await this.requestTranslate(text, sourceLang, targetLang);

    if (data && data[0] && Array.isArray(data[0])) {
      return isArrayInput ? data[0] : data[0].join('');
    }

    return isArrayInput ? [] : '';
  }

  /**
   * @param {string} text
   * @returns {string[]}
   */
  buildSegments(text) {
    const chunks = [];
    const sentences = text.split(/([.!?]+)/);
    let current = '';

    for (const part of sentences) {
      if ((current + part).length > this.options.maxChars) {
        if (current) chunks.push(current);
        current = part;
      } else {
        current += part;
      }
    }

    if (current) chunks.push(current);

    return chunks;
  }

  /**
   * @param {string} text
   * @returns {Promise<DetectionResult>}
   */
  async detectLanguage(text) {
    try {
      const { data } = await this.requestTranslate(text.slice(0, 500), 'auto', 'en');
      const detectedLanguage = data && Array.isArray(data[1]) ? data[1][0] : null;

      return {
        language: detectedLanguage || 'auto',
        confidence: detectedLanguage ? 1.0 : 0.0,
      };
    } catch (e) {
      return { language: 'en', confidence: 1.0 };
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

class TextNodeWalker {
  /**
   * @param {Node} [rootElement]
   */
  constructor(rootElement) {
    this.root = rootElement || document.documentElement;
  }

  /**
   * @param {Element} element
   * @returns {string}
   */
  normalizeTagName(element) {
    return element.tagName.toUpperCase();
  }

  /**
   * @param {Element} element
   * @returns {boolean}
   */
  hasTranslateOverride(element) {
    return element.classList.contains('translate') || element.getAttribute('translate') === 'yes';
  }

  /**
   * @param {Element} element
   * @returns {boolean}
   */
  hasNoTranslateOverride(element) {
    return element.classList.contains('notranslate') || element.getAttribute('translate') === 'no';
  }

  /**
   * @param {Element} element
   * @returns {boolean}
   */
  hasSkipTranslate(element) {
    return element.classList.contains('skiptranslate');
  }

  /**
   * @param {Element} element
   * @returns {boolean}
   */
  isElementVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    if (element instanceof HTMLElement) {
      if (element.offsetWidth || element.offsetHeight) return true;
    }
    const doc = element.ownerDocument;
    const win = doc?.defaultView;
    const style = win?.getComputedStyle ? win.getComputedStyle(element, null) : null;
    return !!style && style.display !== 'none' && style.visibility !== 'hidden';
  }

  /**
   * @param {Element} element
   * @returns {boolean}
   */
  isSubtreeSkippable(element) {
    const tagName = this.normalizeTagName(element);
    return NEVER_TRANSLATE_TAGS.has(tagName) || EMPTY_TRANSLATION_TAGS.has(tagName);
  }

  /**
   * @param {Element} element
   * @param {boolean} inheritedState
   * @returns {boolean}
   */
  getTranslationState(element, inheritedState) {
    if (this.hasNoTranslateOverride(element)) {
      return false;
    }

    if (this.hasTranslateOverride(element)) {
      return true;
    }

    return inheritedState;
  }

  /**
   * @param {Element} element
   * @returns {boolean}
   */
  shouldTranslateValue(element) {
    const tagName = this.normalizeTagName(element);

    if (tagName === 'TEXTAREA') {
      return element.classList.contains('translate');
    }

    if (tagName !== 'INPUT') {
      return false;
    }

    const input = /** @type {HTMLInputElement} */ (element);
    const type = input.type?.toLowerCase();
    return type === 'submit' || type === 'button' || element.classList.contains('translate');
  }

  /**
   * @param {Element} element
   * @returns {string[]}
   */
  getTranslatableAttributes(element) {
    const attrs = [
      'title',
      'alt',
      'placeholder',
      'aria-label',
      'aria-placeholder',
      'aria-roledescription',
      'aria-valuetext',
    ];
    return attrs.filter((attr) => {
      const value = element.getAttribute(attr);
      return typeof value === 'string' && value.trim();
    });
  }

  /**
   * @param {Element} element
   * @returns {string}
   */
  getStoredValue(element) {
    if ('value' in element) {
      return String((/** @type {HTMLInputElement | HTMLTextAreaElement} */ (element)).value ?? '');
    }

    return element.getAttribute('value') || '';
  }

  /**
   * @returns {TextItem[]}
   */
  collect() {
    /** @type {TextItem[]} */
    const items = [];

    this.walkNode(this.root, true, {
      onText: (textNode) => {
        const text = textNode.textContent || '';
        if (text.trim()) {
          items.push({ type: 'text', node: textNode, text });
        }
      },
      onElement: (element, isTranslatable) => {
        if (!isTranslatable) {
          return;
        }

        for (const attr of this.getTranslatableAttributes(element)) {
          const text = element.getAttribute(attr) || '';
          if (text.trim()) {
            items.push({ type: 'attr', node: element, attr, text });
          }
        }

        if (this.shouldTranslateValue(element)) {
          const text = this.getStoredValue(element);
          if (text.trim()) {
            items.push({ type: 'attr', node: element, attr: 'value', text });
          }
        }
      },
    });

    return items;
  }

  /**
   * @returns {HTMLAnchorElement[]}
   */
  collectLinks() {
    /** @type {HTMLAnchorElement[]} */
    const links = [];

    this.walkNode(this.root, true, {
      onElement: (element, isTranslatable) => {
        if (!isTranslatable || this.normalizeTagName(element) !== 'A' || !('href' in element)) {
          return;
        }

        const link = /** @type {HTMLAnchorElement} */ (element);
        const href = link.href;
        if (href.indexOf('javascript:') === 0 || href.indexOf('#') >= 0) {
          return;
        }

        links.push(link);
      },
    });

    return links;
  }

  /**
   * @param {Node} node
   * @param {boolean} inheritedState
   * @param {{
   *   onText?: (textNode: Text, isTranslatable: boolean) => void,
   *   onElement?: (element: Element, isTranslatable: boolean) => void,
   * }} handlers
   * @returns {void}
   */
  walkNode(node, inheritedState, handlers = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = /** @type {Text} */ (node);
      handlers.onText?.(textNode, inheritedState);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = /** @type {Element} */ (node);
    if (this.hasSkipTranslate(element) || !this.isElementVisible(element)) {
      return;
    }

    const translationState = this.getTranslationState(element, inheritedState);
    handlers.onElement?.(element, translationState);

    const tagName = this.normalizeTagName(element);
    if (tagName === 'IFRAME') {
      try {
        const iframe = /** @type {HTMLIFrameElement} */ (element);
        const src = iframe.getAttribute('src') || '';
        const isHttp = /^https?:\/\//.test(src);
        const sameHost = !isHttp || new URL(src, window.location.href).hostname === window.location.hostname;
        if (sameHost && iframe.contentDocument?.documentElement) {
          this.walkNode(iframe.contentDocument.documentElement, translationState, handlers);
        }
      } catch (_err) {
        // Ignore cross-origin iframe access errors.
      }
      return;
    }

    if (element.shadowRoot) {
      for (const childNode of Array.from(element.shadowRoot.childNodes)) {
        this.walkNode(childNode, translationState, handlers);
      }
    }

    if (this.isSubtreeSkippable(element)) {
      return;
    }

    for (const childNode of Array.from(element.childNodes)) {
      this.walkNode(childNode, translationState, handlers);
    }
  }

  /**
   * @param {TextItem[]} nodes
   * @param {number} [maxLength=4000]
   * @returns {TextItem[][]}
   */
  groupNodes(nodes, maxLength = 4000) {
    const groups = [];
    let currentGroup = [];
    let currentLength = 0;

    for (const node of nodes) {
      const text = node.text;
      if (!text) continue;

      if (currentLength + text.length > maxLength && currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
        currentLength = 0;
      }

      currentGroup.push(node);
      currentLength += text.length;
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }
}

class PageTranslator {
  /**
   * @param {GoogleTranslator} translator
   * @param {PageTranslatorOptions} [options]
   */
  constructor(translator, options = {}) {
    this.translator = translator;
    this.options = {
      onProgress: options.onProgress || (() => {}),
      onComplete: options.onComplete || (() => {}),
      onError: options.onError || (() => {}),
      ...options,
    };

    this.originalLang = null;
    this.originalXmlLang = null;
    this.originalTitle = '';
    this.originalLinks = [];
    this.directionClass = null;
    this.translated = false;
    this.translating = false;
    this.sourceLang = null;
    this.targetLang = null;
    /** @type {Map<TextItem, string>} */
    this.nodeMap = new Map();
    /** @type {Map<Text, string>} */
    this.originalTextMap = new Map();
    /** @type {Map<Element, Map<string, string | null>>} */
    this.originalAttrMap = new Map();
  }

  /**
   * @returns {Promise<string>}
   */
  async detectLanguage() {
    if (document.documentElement.lang) {
      return document.documentElement.lang;
    }

    const walker = new TextNodeWalker(document.documentElement);
    const nodes = walker.collect().slice(0, 10);
    const sampleText = nodes
      .map((n) => n.text)
      .join(' ')
      .slice(0, 500);

    const result = await this.translator.detectLanguage(sampleText);
    return result.language;
  }

  /**
   * @param {string} [sourceLang='auto']
   * @param {string} [targetLang='en']
   * @returns {Promise<void>}
   */
  async translate(sourceLang = 'auto', targetLang = 'en') {
    if (this.translating) {
      return;
    }

    if (
      this.translated && targetLang === this.targetLang && (sourceLang === 'auto' || sourceLang === this.sourceLang)
    ) {
      return;
    }

    if (this.translated) {
      this.restore();
    }

    this.translating = true;

    try {
      const html = document.documentElement;
      this.originalLang = html.getAttribute('lang');
      this.originalXmlLang = html.getAttribute('xml:lang');
      this.originalTitle = document.title;
      this.nodeMap.clear();
      this.originalTextMap.clear();
      this.originalAttrMap.clear();
      this.originalLinks = [];
      this.directionClass = null;

      if (sourceLang === 'auto') {
        sourceLang = await this.detectLanguage();
      }

      this.sourceLang = sourceLang;
      this.targetLang = targetLang;

      if (sourceLang === targetLang) {
        this.translated = false;
        return;
      }

      await this.translateTitle(sourceLang, targetLang);

      const walker = new TextNodeWalker(document.documentElement);
      const nodes = walker.collect();
      const groups = walker.groupNodes(nodes, 4000);

      let translatedCount = 0;

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];

        this.options.onProgress({
          group: i + 1,
          totalGroups: groups.length,
          percent: Math.round(((i + 1) / groups.length) * 100),
          nodes: translatedCount,
        });

        const texts = group.map((g) => g.text);

        try {
          const translated = await this.translator.translateApi(texts, sourceLang, targetLang);

          if (Array.isArray(translated)) {
            group.forEach((item, idx) => {
              if (idx < translated.length) {
                this.storeOriginalItem(item);
                this.nodeMap.set(item, translated[idx]);
              }
            });
          }

          translatedCount += texts.length;
        } catch (e) {
          group.forEach((item) => {
            this.nodeMap.set(item, item.text);
          });
        }
      }

      this.applyTranslations(targetLang);
      this.translated = true;

      this.options.onComplete({
        totalNodes: this.nodeMap.size,
        sourceLang,
        targetLang,
      });
    } catch (error) {
      this.options.onError(error);
      throw error;
    } finally {
      this.translating = false;
    }
  }

  /**
   * @param {string} targetLang
   * @returns {void}
   */
  applyTranslations(targetLang) {
    this.nodeMap.forEach((translatedText, item) => {
      if (item.type === 'text') {
        const node = /** @type {Text} */ (item.node);
        if (node.parentNode) {
          node.textContent = translatedText;
        }
      } else if (item.type === 'attr' && item.attr) {
        const element = /** @type {Element} */ (item.node);
        if (element.isConnected) {
          this.setStoredAttributeValue(element, item.attr, translatedText);
        }
      }
    });

    this.translateLinks();
    this.applyDirection(targetLang);

    const html = document.documentElement;
    if (html.hasAttribute('lang')) {
      html.setAttribute('lang', targetLang);
    }
    if (html.hasAttribute('xml:lang')) {
      html.setAttribute('xml:lang', targetLang);
    }
  }

  /**
   * @param {string} sourceLang
   * @param {string} targetLang
   * @returns {Promise<void>}
   */
  async translateTitle(sourceLang, targetLang) {
    if (!this.originalTitle.trim()) {
      return;
    }

    const translated = await this.translator.translateApi([this.originalTitle], sourceLang, targetLang);
    if (Array.isArray(translated) && translated[0]) {
      document.title = translated[0];
    }
  }

  /**
   * @param {TextItem} item
   * @returns {void}
   */
  storeOriginalItem(item) {
    if (item.type === 'text') {
      const textNode = /** @type {Text} */ (item.node);
      if (!this.originalTextMap.has(textNode)) {
        this.originalTextMap.set(textNode, textNode.textContent || '');
      }
      return;
    }

    if (item.type === 'attr' && item.attr) {
      const element = /** @type {Element} */ (item.node);
      if (!this.originalAttrMap.has(element)) {
        this.originalAttrMap.set(element, new Map());
      }

      const attrMap = this.originalAttrMap.get(element);
      if (attrMap && !attrMap.has(item.attr)) {
        attrMap.set(item.attr, this.getStoredAttributeValue(element, item.attr));
      }
    }
  }

  /**
   * @param {Element} element
   * @param {string} attr
   * @returns {string | null}
   */
  getStoredAttributeValue(element, attr) {
    if (attr === 'value' && 'value' in element) {
      return String((/** @type {HTMLInputElement | HTMLTextAreaElement} */ (element)).value ?? '');
    }

    return element.getAttribute(attr);
  }

  /**
   * @param {Element} element
   * @param {string} attr
   * @param {string} value
   * @returns {void}
   */
  setStoredAttributeValue(element, attr, value) {
    if (attr === 'value' && 'value' in element) {
      const input = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (element);
      element.setAttribute(attr, value);
      input.value = value;
      return;
    }

    element.setAttribute(attr, value);
  }

  translateLinks() {
    const walker = new TextNodeWalker(document.documentElement);
    for (const link of walker.collectLinks()) {
      const href = link.href;
      this.originalLinks.push({ element: link, href });
      link.href = `${href}#googtrans/${this.sourceLang}/${this.targetLang}`;
    }
  }

  /**
   * @param {string} targetLang
   * @returns {void}
   */
  applyDirection(targetLang) {
    const html = document.documentElement;
    const directionClass = RTL_LANGUAGES.has(targetLang.toLowerCase()) ? 'translated-rtl' : 'translated-ltr';

    if (!html.classList.contains('translated-rtl') && !html.classList.contains('translated-ltr')) {
      ensureDirectionStyles();
      this.directionClass = directionClass;
      html.classList.add(directionClass);
    }
  }

  /**
   * @returns {void}
   */
  restore() {
    this.originalTextMap.forEach((originalText, node) => {
      if (node.parentNode) {
        node.textContent = originalText;
      }
    });

    this.originalAttrMap.forEach((attrs, element) => {
      if (!element.isConnected) return;
      attrs.forEach((value, attr) => {
        if (attr === 'value') {
          this.setStoredAttributeValue(element, attr, value || '');
          return;
        }

        if (value === null) {
          element.removeAttribute(attr);
          return;
        }

        element.setAttribute(attr, value);
      });
    });

    for (const { element, href } of this.originalLinks) {
      element.href = href;
    }

    if (this.directionClass) {
      document.documentElement.classList.remove(this.directionClass);
    }

    document.title = this.originalTitle;

    if (this.originalLang === null) {
      document.documentElement.removeAttribute('lang');
    } else {
      document.documentElement.setAttribute('lang', this.originalLang);
    }
    if (this.originalXmlLang === null) {
      document.documentElement.removeAttribute('xml:lang');
    } else {
      document.documentElement.setAttribute('xml:lang', this.originalXmlLang);
    }
    this.sourceLang = null;
    this.targetLang = null;
    this.translated = false;
    this.nodeMap.clear();
    this.originalTextMap.clear();
    this.originalAttrMap.clear();
    this.originalLinks = [];
    this.directionClass = null;
  }

  getState() {
    return {
      mode: this.translated ? 'translated' : 'original',
      sourceLang: this.sourceLang,
      targetLang: this.targetLang,
      translating: this.translating,
      translatedNodes: this.nodeMap.size,
    };
  }
}

const translator = new GoogleTranslator();
const pageTranslator = new PageTranslator(translator);

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown translation error.';
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string' || !message.type.startsWith('pageTranslator:')) {
    return undefined;
  }

  (async () => {
    try {
      switch (message.type) {
        case 'pageTranslator:getState':
          sendResponse(pageTranslator.getState());
          break;
        case 'pageTranslator:translate':
          await pageTranslator.translate(message.sourceLang, message.targetLang);
          sendResponse(pageTranslator.getState());
          break;
        case 'pageTranslator:restore':
          pageTranslator.restore();
          sendResponse(pageTranslator.getState());
          break;
        default:
          sendResponse({ error: `Unsupported message type: ${message.type}` });
      }
    } catch (error) {
      sendResponse({ error: getErrorMessage(error) });
    }
  })();

  return true;
});
