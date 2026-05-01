export class TranslationError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
    this.name = 'TranslationError';
  }
}

export interface TranslateOptions {
  apiKey: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TranslateResult {
  translatedText: string;
}

interface AttributeTarget {
  element: Element;
  attr: string;
}

const rtlLanguages = new Set([
  'ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ky', 'kk', 'ug', 'mn', 'tg',
  'tk', 'uz', 'az', 'bn', 'pa', 'gu', 'ml', 'ta', 'te', 'kn', 'or', 'mr',
  'ne', 'si', 'am', 'ti',
]);

const neverTranslate = new Set([
  'APPLET', 'AREA', 'BASE', 'FRAME', 'FRAMESET', 'HR', 'LINK', 'META',
  'NOFRAMES', 'NOSCRIPT', 'INPUT', 'TEXTAREA', 'TITLE',
]);

const emptyElements = new Set([
  'BR', 'CODE', 'IMG', 'KBD', 'MAP', 'OBJECT', 'PARAM', 'RP',
  'SCRIPT', 'STYLE', 'WBR', 'SVG',
]);

function normalizeTagName(element: Element): string {
  return element.tagName.toUpperCase();
}

function hasTranslateOverride(el: Element): boolean {
  return el.classList.contains('translate') || el.getAttribute('translate') === 'yes';
}

function hasNoTranslateOverride(el: Element): boolean {
  return el.classList.contains('notranslate') || el.getAttribute('translate') === 'no';
}

function hasSkipTranslate(el: Element): boolean {
  return el.classList.contains('skiptranslate');
}

function isElementVisible(el: Element): boolean {
  if (el instanceof HTMLElement && (el.offsetWidth || el.offsetHeight)) {
    return true;
  }

  const view = el.ownerDocument.defaultView;
  const style = view?.getComputedStyle ? view.getComputedStyle(el, null) : null;

  return !!style && style.display !== 'none' && style.visibility !== 'hidden';
}

function isSubtreeSkippable(el: Element): boolean {
  const tagName = normalizeTagName(el);
  return neverTranslate.has(tagName) || emptyElements.has(tagName);
}

function getTranslationState(el: Element, inheritedState: boolean): boolean {
  if (hasNoTranslateOverride(el)) {
    return false;
  }

  if (hasTranslateOverride(el)) {
    return true;
  }

  return inheritedState;
}

function shouldTranslateValue(el: Element): boolean {
  const tagName = normalizeTagName(el);

  if (tagName === 'TEXTAREA') {
    return el.classList.contains('translate');
  }

  if (tagName !== 'INPUT') {
    return false;
  }

  const input = el as HTMLInputElement;
  const type = input.type?.toLowerCase();
  return type === 'submit' || type === 'button' || el.classList.contains('translate');
}

function isRtl(lang: string): boolean {
  return rtlLanguages.has(lang.toLowerCase());
}

function setLanguageAttribute(element: Element, lang: string): void {
  if (element.getAttribute('xml:lang')) {
    element.setAttribute('xml:lang', lang);
  }
  if (element.getAttribute('lang')) {
    element.setAttribute('lang', lang);
  }
}

function getOriginalLangAttribute(element: Element): { lang: string | null; xmlLang: string | null } {
  return {
    lang: element.getAttribute('lang'),
    xmlLang: element.getAttribute('xml:lang'),
  };
}

function restoreLanguageAttribute(element: Element, originalLang: string | null, originalXmlLang: string | null): void {
  if (originalXmlLang !== null) {
    element.setAttribute('xml:lang', originalXmlLang);
  } else if (element.hasAttribute('xml:lang')) {
    element.removeAttribute('xml:lang');
  }
  if (originalLang !== null) {
    element.setAttribute('lang', originalLang);
  } else if (element.hasAttribute('lang')) {
    element.removeAttribute('lang');
  }
}

function getDirectionClass(targetLang: string): string {
  return isRtl(targetLang) ? 'translated-rtl' : 'translated-ltr';
}

export class PageTranslator {
  private originalTexts: Map<Text, string> = new Map();
  private originalLinks: Array<{ element: HTMLAnchorElement; originalHref: string }> = [];
  private originalAttrs: Map<Element, Map<string, string | null>> = new Map();
  private originalLang: string | null = null;
  private originalXmlLang: string | null = null;
  private originalTitle: string = '';
  private sourceLanguage: string = '';
  private targetLanguage: string = '';
  private rootElement: Element | null = null;
  private directionClass: string | null = null;
  private translated: boolean = false;

  constructor(private options: TranslateOptions) {
  }

  async translate(texts: string[]): Promise<TranslateResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const requestBody = [[texts, this.sourceLanguage, this.targetLanguage], 'wt_lib'];

    const response = await fetch('https://translate-pa.googleapis.com/v1/translateHtml', {
      method: 'POST',
      headers: {
        'X-goog-api-key': this.options.apiKey,
        'Content-Type': 'application/json+protobuf',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new TranslationError(
        `HTTP ${response.status}: ${response.statusText}`,
        errorBody,
        response.status
      );
    }

    const result = await response.json();

    if (!Array.isArray(result) || !Array.isArray(result[0])) {
      throw new TranslationError('No translations in response');
    }

    return result[0].map((translatedText: unknown) => ({
      translatedText: typeof translatedText === 'string' ? translatedText : '',
    }));
  }

  async translatePage(element: Element = document.documentElement): Promise<void> {
    const newSource = this.options.sourceLanguage;
    const newTarget = this.options.targetLanguage;

    if (this.translated && newSource === this.sourceLanguage && newTarget === this.targetLanguage) {
      return;
    }

    // Reset if language changed
    if (this.translated && (newSource !== this.sourceLanguage || newTarget !== this.targetLanguage)) {
      this.restore();
    }

    this.sourceLanguage = newSource;
    this.targetLanguage = newTarget;
    this.rootElement = element;

    const originalAttrs = getOriginalLangAttribute(element);
    this.originalLang = originalAttrs.lang;
    this.originalXmlLang = originalAttrs.xmlLang;
    this.originalTitle = document.title;
    this.originalTexts.clear();
    this.originalAttrs.clear();
    this.originalLinks = [];
    this.directionClass = null;

    await this.translateElements(element);
    this.translateLinks(element);
    this.setPageDirection(element);
    setLanguageAttribute(element, this.targetLanguage);

    this.translated = true;
  }

  private async translateElements(element: Element): Promise<void> {
    if (this.originalTitle.trim().length > 0) {
      const results = await this.translate([this.originalTitle]);
      if (results[0]) {
        document.title = results[0].translatedText;
      }
    }

    const nodes: Text[] = [];
    const attrTexts: string[] = [];
    const attrElements: AttributeTarget[] = [];
    this.collectContent(element, true, nodes, attrTexts, attrElements);

    const textCount = nodes.length;
    const texts = nodes.map((node) => node.textContent ?? '');

    const allTexts = [...texts, ...attrTexts];
    if (allTexts.length === 0) {
      return;
    }

    const results = await this.translate(allTexts);

    // Apply text node translations
    for (let i = 0; i < textCount; i++) {
      if (results[i] && nodes[i]) {
        nodes[i].textContent = results[i].translatedText;
      }
    }

    // Apply attribute translations
    const attrResults = results.slice(textCount);
    for (let i = 0; i < attrElements.length; i++) {
      const { element: targetElement, attr } = attrElements[i];
      if (!this.originalAttrs.has(targetElement)) {
        this.originalAttrs.set(targetElement, new Map());
      }
      const attrs = this.originalAttrs.get(targetElement)!;
      if (!attrs.has(attr)) {
        attrs.set(attr, this.getStoredAttributeValue(targetElement, attr));
      }

      if (attrResults[i]) {
        this.setStoredAttributeValue(targetElement, attr, attrResults[i].translatedText);
      }
    }
  }

  private collectContent(
    node: Node,
    inheritedState: boolean,
    textNodes: Text[],
    attrTexts: string[],
    attrTargets: AttributeTarget[]
  ): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (inheritedState && text.trim()) {
        const textNode = node as Text;
        if (!this.originalTexts.has(textNode)) {
          this.originalTexts.set(textNode, text);
        }
        textNodes.push(textNode);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as Element;

    if (hasSkipTranslate(element) || !isElementVisible(element)) {
      return;
    }

    const translationState = getTranslationState(element, inheritedState);

    if (translationState) {
      this.collectAttributes(element, attrTexts, attrTargets);
      this.collectValue(element, attrTexts, attrTargets);
    }

    if (normalizeTagName(element) === 'IFRAME') {
      this.collectIframeContent(element as HTMLIFrameElement, translationState, textNodes, attrTexts, attrTargets);
      return;
    }

    if (element.shadowRoot) {
      for (const childNode of Array.from(element.shadowRoot.childNodes)) {
        this.collectContent(childNode, translationState, textNodes, attrTexts, attrTargets);
      }
    }

    if (isSubtreeSkippable(element)) {
      return;
    }

    for (const childNode of Array.from(element.childNodes)) {
      this.collectContent(childNode, translationState, textNodes, attrTexts, attrTargets);
    }
  }

  private collectAttributes(element: Element, texts: string[], elements: AttributeTarget[]): void {
    const attrNames = ['title', 'alt', 'placeholder', 'aria-label', 'aria-placeholder', 'aria-roledescription', 'aria-valuetext'];

    for (const attr of attrNames) {
      const value = element.getAttribute(attr);
      if (value && value.trim()) {
        texts.push(value);
        elements.push({ element, attr });
      }
    }
  }

  private collectValue(element: Element, texts: string[], elements: AttributeTarget[]): void {
    if (!shouldTranslateValue(element)) {
      return;
    }

    const value = this.getStoredAttributeValue(element, 'value');
    if (typeof value === 'string' && value.trim()) {
      texts.push(value);
      elements.push({ element, attr: 'value' });
    }
  }

  private collectIframeContent(
    iframe: HTMLIFrameElement,
    inheritedState: boolean,
    textNodes: Text[],
    attrTexts: string[],
    attrTargets: AttributeTarget[]
  ): void {
    try {
      const src = iframe.getAttribute('src') || '';
      const isHttp = /^https?:\/\//.test(src);
      const sameHost = !isHttp || new URL(src, window.location.href).hostname === window.location.hostname;

      if (sameHost && iframe.contentDocument?.documentElement) {
        this.collectContent(iframe.contentDocument.documentElement, inheritedState, textNodes, attrTexts, attrTargets);
      }
    } catch {
      // Ignore cross-origin iframe access errors.
    }
  }

  private getStoredAttributeValue(element: Element, attr: string): string | null {
    if (attr === 'value' && 'value' in element) {
      return String((element as HTMLInputElement | HTMLTextAreaElement).value ?? '');
    }

    return element.getAttribute(attr);
  }

  private setStoredAttributeValue(element: Element, attr: string, value: string): void {
    if (attr === 'value' && 'value' in element) {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      element.setAttribute(attr, value);
      input.value = value;
      return;
    }

    element.setAttribute(attr, value);
  }

  private translateLinks(element: Element): void {
    this.rewriteLinks(element, true);
  }

  private rewriteLinks(node: Node, inheritedState: boolean): void {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as Element;
    if (hasSkipTranslate(element) || !isElementVisible(element)) {
      return;
    }

    const translationState = getTranslationState(element, inheritedState);
    const tagName = normalizeTagName(element);

    if (translationState && tagName === 'A' && 'href' in element) {
      const link = element as HTMLAnchorElement;
      const href = link.href;

      if (href.indexOf('javascript:') !== 0 && href.indexOf('#') < 0) {
        this.originalLinks.push({
          element: link,
          originalHref: href,
        });
        link.href = href + '#googtrans/' + this.sourceLanguage + '/' + this.targetLanguage;
      }
    }

    if (tagName === 'IFRAME') {
      try {
        const iframe = element as HTMLIFrameElement;
        const src = iframe.getAttribute('src') || '';
        const isHttp = /^https?:\/\//.test(src);
        const sameHost = !isHttp || new URL(src, window.location.href).hostname === window.location.hostname;

        if (sameHost && iframe.contentDocument?.documentElement) {
          this.rewriteLinks(iframe.contentDocument.documentElement, translationState);
        }
      } catch {
        // Ignore cross-origin iframe access errors.
      }
      return;
    }

    if (element.shadowRoot) {
      for (const childNode of Array.from(element.shadowRoot.childNodes)) {
        this.rewriteLinks(childNode, translationState);
      }
    }

    if (isSubtreeSkippable(element)) {
      return;
    }

    for (const childNode of Array.from(element.childNodes)) {
      this.rewriteLinks(childNode, translationState);
    }
  }

  private setPageDirection(element: Element): void {
    const className = getDirectionClass(this.targetLanguage);
    if (!element.classList.contains('translated-rtl') && !element.classList.contains('translated-ltr')) {
      this.directionClass = className;
      element.classList.add(className);
    }
  }

  restore(): void {
    if (!this.translated) {
      return;
    }

    this.restoreElements();
    this.restoreAttributes();
    this.restoreLinks();
    this.restoreDirection();
    if (this.rootElement) {
      restoreLanguageAttribute(this.rootElement, this.originalLang, this.originalXmlLang);
    }
    document.title = this.originalTitle;

    this.rootElement = null;
    this.directionClass = null;
    this.translated = false;
  }

  private restoreAttributes(): void {
    for (const [el, attrs] of this.originalAttrs) {
      for (const [attr, originalValue] of attrs) {
        if (attr === 'value') {
          const input = el as HTMLInputElement | HTMLTextAreaElement;
          const restoredValue = originalValue ?? '';
          el.setAttribute(attr, restoredValue);
          if ('value' in input) {
            input.value = restoredValue;
          }
          continue;
        }

        if (originalValue === null) {
          el.removeAttribute(attr);
          continue;
        }

        el.setAttribute(attr, originalValue);
      }
    }
    this.originalAttrs = new Map();
  }

  private restoreElements(): void {
    for (const [node, originalText] of this.originalTexts) {
      node.textContent = originalText;
    }
    this.originalTexts = new Map();
  }

  private restoreLinks(): void {
    for (const { element, originalHref } of this.originalLinks) {
      element.href = originalHref;
    }
    this.originalLinks = [];
  }

  private restoreDirection(): void {
    if (this.rootElement && this.directionClass) {
      this.rootElement.classList.remove(this.directionClass);
    }
  }

  isTranslated(): boolean {
    return this.translated;
  }
}
