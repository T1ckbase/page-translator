// @ts-check

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
 * @typedef {Object} TextNodeWalkerOptions
 * @property {string[]} [blockedTags]
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
   * @param {ParentNode | HTMLElement} [rootElement]
   * @param {TextNodeWalkerOptions} [options]
   */
  constructor(rootElement, options = {}) {
    this.root = rootElement || document.body;
    this.options = {
      blockedTags: options.blockedTags || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'CODE', 'PRE'],
      ...options,
    };
  }

  /**
   * @param {Node | null} node
   * @returns {boolean}
   */
  isTranslatable(node) {
    if (!node) {
      return false;
    }

    const isText = node.nodeType === Node.TEXT_NODE;
    const isElement = node.nodeType === Node.ELEMENT_NODE;
    const textContent = node.textContent;

    if (!isText && !isElement) return false;
    if (!textContent || !textContent.trim()) return false;

    const ancestors = [];
    let current = isElement ? /** @type {Element} */ (node) : node.parentElement;

    while (current) {
      ancestors.unshift(current);
      if (current === this.root) {
        break;
      }
      current = current.parentElement;
    }

    let isTranslatable = true;

    for (const element of ancestors) {
      if (this.options.blockedTags.includes(element.tagName)) {
        return false;
      }

      if (element.classList && element.classList.contains('skiptranslate')) {
        return false;
      }

      const translateAttr = element.getAttribute && element.getAttribute('translate');

      if ((element.classList && element.classList.contains('notranslate')) || translateAttr === 'no') {
        isTranslatable = false;
        continue;
      }

      if ((element.classList && element.classList.contains('translate')) || translateAttr === 'yes') {
        isTranslatable = true;
      }
    }

    return isTranslatable;
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
  isSkippableElement(element) {
    const tag = element.tagName;
    const skippedTags = new Set([
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
      'BR',
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
    return skippedTags.has(tag) || element.classList.contains('skiptranslate');
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
   * @returns {TextItem[]}
   */
  collect() {
    /** @type {TextItem[]} */
    const items = [];

    /** @param {ParentNode | HTMLElement} scopeRoot */
    const collectFromScope = (scopeRoot) => {
      const walker = document.createTreeWalker(scopeRoot, NodeFilter.SHOW_ALL, {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return this.isTranslatable(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        },
      });

      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE) {
          const textNode = /** @type {Text} */ (node);
          const text = textNode.textContent || '';
          if (text.trim()) {
            items.push({ type: 'text', node: textNode, text });
          }
          continue;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const element = /** @type {Element} */ (node);
        if (!this.isElementVisible(element)) continue;
        if (this.isSkippableElement(element)) continue;

        if (this.isTranslatable(element)) {
          for (const attr of this.getTranslatableAttributes(element)) {
            const text = element.getAttribute(attr) || '';
            if (text.trim()) {
              items.push({ type: 'attr', node: element, attr, text });
            }
          }
        }

        if (element.shadowRoot) {
          collectFromScope(element.shadowRoot);
        }

        if (element.tagName === 'IFRAME') {
          const iframe = /** @type {HTMLIFrameElement} */ (element);
          try {
            const src = iframe.getAttribute('src') || '';
            const isHttp = /^https?:\/\//.test(src);
            const sameHost = !isHttp || new URL(src, window.location.href).hostname === window.location.hostname;
            if (sameHost && iframe.contentDocument?.documentElement) {
              collectFromScope(iframe.contentDocument.documentElement);
            }
          } catch (_err) {
            // Ignore cross-origin iframe access errors.
          }
        }
      }
    };

    collectFromScope(this.root);
    return items;
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
    this.translating = false;
    this.sourceLang = null;
    this.targetLang = null;
    /** @type {Map<TextItem, string>} */
    this.nodeMap = new Map();
    /** @type {Map<Text, string | null>} */
    this.originalTextMap = new Map();
    /** @type {Map<Element, Map<string, string>>} */
    this.originalAttrMap = new Map();
  }

  /**
   * @returns {Promise<string>}
   */
  async detectLanguage() {
    if (document.documentElement.lang) {
      return document.documentElement.lang;
    }

    const walker = new TextNodeWalker(document.body);
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

    if (this.nodeMap.size > 0) {
      this.restore();
    }

    this.translating = true;
    this.originalLang = document.documentElement.getAttribute('lang');
    this.originalXmlLang = document.documentElement.getAttribute('xml:lang');
    this.nodeMap.clear();
    this.originalTextMap.clear();
    this.originalAttrMap.clear();

    try {
      if (sourceLang === 'auto') {
        sourceLang = await this.detectLanguage();
      }

      if (sourceLang === targetLang) {
        this.sourceLang = sourceLang;
        this.targetLang = targetLang;
        return;
      }

      const walker = new TextNodeWalker(document.body);
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
                if (item.type === 'text') {
                  const textNode = /** @type {Text} */ (item.node);
                  if (!this.originalTextMap.has(textNode)) {
                    this.originalTextMap.set(textNode, textNode.textContent);
                  }
                } else if (item.type === 'attr' && item.attr) {
                  const element = /** @type {Element} */ (item.node);
                  if (!this.originalAttrMap.has(element)) {
                    this.originalAttrMap.set(element, new Map());
                  }
                  const attrMap = this.originalAttrMap.get(element);
                  if (attrMap && !attrMap.has(item.attr)) {
                    attrMap.set(item.attr, element.getAttribute(item.attr) || '');
                  }
                }
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
      this.sourceLang = sourceLang;
      this.targetLang = targetLang;

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
          element.setAttribute(item.attr, translatedText);
        }
      }
    });

    const html = document.documentElement;
    if (html.hasAttribute('lang')) {
      html.setAttribute('lang', targetLang);
    }
    if (html.hasAttribute('xml:lang')) {
      html.setAttribute('xml:lang', targetLang);
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
        element.setAttribute(attr, value);
      });
    });

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
    this.nodeMap.clear();
    this.originalTextMap.clear();
    this.originalAttrMap.clear();
  }

  getState() {
    return {
      mode: this.nodeMap.size > 0 ? 'translated' : 'original',
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
