/**
 * Detects anti-bot, CAPTCHA, or access-restriction pages without attempting any bypass.
 */
export async function detectCompatibilityIssues(page, responseStatus) {
  const detection = await page.evaluate(() => {
    const title = (document.title || '').toLowerCase();
    const bodyText = (document.body?.innerText || '').slice(0, 4000).toLowerCase();

    const captchaSelectors = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      'iframe[src*="challenges.cloudflare.com"]',
      '.g-recaptcha',
      '.h-captcha',
      '.cf-turnstile',
      '#cf-challenge-running',
      '#challenge-form',
    ];

    const hasCaptchaNode = captchaSelectors.some((sel) => Boolean(document.querySelector(sel)));
    const hasChallengeText =
      title.includes('just a moment') ||
      title.includes('attention required') ||
      bodyText.includes('verify you are human') ||
      bodyText.includes('checking your browser before accessing') ||
      bodyText.includes('enable javascript and cookies to continue');

    return {
      hasCaptchaNode,
      hasChallengeText,
      title: document.title || '',
      textLength: (document.body?.innerText || '').trim().length,
    };
  });

  if (detection.hasCaptchaNode || detection.hasChallengeText) {
    return {
      compatible: false,
      code: 'ANTIBOT_OR_CAPTCHA_DETECTED',
      message:
        'This website uses CAPTCHA or anti-bot verification. ReviseX respects website security controls and does not bypass verification challenges.',
    };
  }

  if (responseStatus && (responseStatus === 401 || responseStatus === 403)) {
    return {
      compatible: false,
      code: 'ACCESS_RESTRICTED',
      message: `The target website returned HTTP ${responseStatus}. Authenticated or access-restricted pages cannot be edited anonymously.`,
    };
  }

  return { compatible: true, code: null, message: null };
}

/**
 * Extracts a sanitized, self-contained HTML snapshot, stable element IDs + fingerprints,
 * navigation links, and a hierarchical layer tree from the live Playwright page.
 */
export async function extractPageSnapshot(page, baseUrl) {
  return page.evaluate((originUrl) => {
    const IGNORED_TAGS = new Set([
      'SCRIPT',
      'NOSCRIPT',
      'STYLE',
      'LINK',
      'META',
      'HEAD',
      'BR',
      'HR',
      'SOURCE',
      'TRACK',
      'PARAM',
    ]);

    const TEXT_EDITABLE_TAGS = new Set([
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'P',
      'A',
      'BUTTON',
      'SPAN',
      'LABEL',
      'LI',
      'BLOCKQUOTE',
      'FIGCAPTION',
      'STRONG',
      'EM',
      'TD',
      'TH',
    ]);

    function simpleHash(str) {
      let hash = 5381;
      for (let i = 0; i < str.length; i++) {
        hash = (hash * 33) ^ str.charCodeAt(i);
      }
      return (hash >>> 0).toString(36);
    }

    function getNthPath(el) {
      const parts = [];
      let curr = el;
      while (curr && curr.nodeType === 1 && curr !== document.documentElement) {
        const tag = curr.tagName.toLowerCase();
        if (curr === document.body) {
          parts.unshift('body');
          break;
        }
        let index = 1;
        let sib = curr.previousElementSibling;
        while (sib) {
          if (sib.tagName === curr.tagName) index++;
          sib = sib.previousElementSibling;
        }
        parts.unshift(`${tag}:nth-of-type(${index})`);
        curr = curr.parentElement;
      }
      return parts.join(' > ');
    }

    function getCssPath(el) {
      const parts = [];
      let curr = el;
      while (curr && curr.nodeType === 1 && curr !== document.documentElement) {
        let sel = curr.tagName.toLowerCase();
        if (curr.id && !curr.id.startsWith('rx-')) {
          sel += `#${CSS.escape(curr.id)}`;
          parts.unshift(sel);
          break;
        }
        const cls = Array.from(curr.classList || [])
          .filter((c) => !c.startsWith('revisex-'))
          .slice(0, 2)
          .map((c) => `.${CSS.escape(c)}`)
          .join('');
        sel += cls;
        parts.unshift(sel);
        curr = curr.parentElement;
      }
      return parts.join(' > ');
    }

    function computeFingerprint(el) {
      const tagName = el.tagName.toLowerCase();
      const domId = el.id || '';
      const classSignature = Array.from(el.classList || [])
        .filter((c) => !c.startsWith('revisex-'))
        .sort()
        .join(' ');
      const textSnippet = (el.innerText || el.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
      const attrSeed = [
        el.getAttribute('src') || '',
        el.getAttribute('href') || '',
        el.getAttribute('alt') || '',
        el.getAttribute('type') || '',
        el.getAttribute('role') || '',
        el.getAttribute('aria-label') || '',
      ].join('|');

      return {
        tagName,
        domId,
        cssPath: getCssPath(el),
        nthPath: getNthPath(el),
        classSignature,
        textSnippet,
        attributesHash: simpleHash(attrSeed),
      };
    }

    let counter = 0;
    const elementMap = {};

    function tagElement(el) {
      if (!el || el.nodeType !== 1 || IGNORED_TAGS.has(el.tagName)) return null;
      let rxId = el.getAttribute('data-revisex-id');
      if (!rxId) {
        counter += 1;
        rxId = `rx-el-${counter}`;
        el.setAttribute('data-revisex-id', rxId);
      }

      const fp = computeFingerprint(el);
      const computed = window.getComputedStyle(el);
      const isImage = el.tagName === 'IMG';
      const hasDirectText = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 0
      );
      const editableType = isImage
        ? 'image'
        : TEXT_EDITABLE_TAGS.has(el.tagName) || hasDirectText
          ? 'text'
          : 'container';

      elementMap[rxId] = {
        elementId: rxId,
        fingerprint: fp,
        editableType,
        tagName: fp.tagName,
        src: isImage ? el.currentSrc || el.getAttribute('src') || '' : undefined,
        alt: isImage ? el.getAttribute('alt') || '' : undefined,
        text: editableType === 'text' ? (el.innerText || '').trim() : undefined,
        styles: {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          borderColor: computed.borderColor,
          fontSize: computed.fontSize,
          fontFamily: computed.fontFamily,
          fontWeight: computed.fontWeight,
          textAlign: computed.textAlign,
          lineHeight: computed.lineHeight,
          letterSpacing: computed.letterSpacing,
          width: computed.width,
          height: computed.height,
          borderRadius: computed.borderRadius,
          display: computed.display,
          visibility: computed.visibility,
        },
      };

      return rxId;
    }

    function buildLayerNode(el, depth = 0) {
      if (!el || el.nodeType !== 1 || IGNORED_TAGS.has(el.tagName) || depth > 6) return null;
      const rxId = tagElement(el);
      if (!rxId) return null;

      const meta = elementMap[rxId];
      const children = [];
      for (const child of el.children) {
        const node = buildLayerNode(child, depth + 1);
        if (node) children.push(node);
      }

      const labelText =
        meta.tagName === 'img'
          ? el.getAttribute('alt') || 'Image'
          : (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 28);

      return {
        id: rxId,
        tagName: meta.tagName,
        editableType: meta.editableType,
        label: labelText ? `${meta.tagName} · ${labelText}` : meta.tagName,
        children,
      };
    }

    // Tag all body elements recursively
    const layers = [];
    if (document.body) {
      tagElement(document.body);
      for (const child of document.body.children) {
        const node = buildLayerNode(child, 0);
        if (node) layers.push(node);
      }
      // Ensure deeper elements beyond depth 6 are still tagged
      const allEls = document.body.querySelectorAll('*');
      for (const el of allEls) {
        if (!IGNORED_TAGS.has(el.tagName) && !el.getAttribute('data-revisex-id')) {
          tagElement(el);
        }
      }
    }

    // Collect navigable same-origin links
    const navLinks = [];
    const seenUrls = new Set();
    let parsedOrigin = '';
    try {
      parsedOrigin = new URL(originUrl).origin;
    } catch {
      parsedOrigin = window.location.origin;
    }

    for (const a of document.querySelectorAll('a[href]')) {
      try {
        const resolved = new URL(a.getAttribute('href'), originUrl);
        if (
          (resolved.protocol === 'http:' || resolved.protocol === 'https:') &&
          resolved.origin === parsedOrigin &&
          !seenUrls.has(resolved.href)
        ) {
          seenUrls.add(resolved.href);
          navLinks.push({
            url: resolved.href,
            label: (a.innerText || a.getAttribute('aria-label') || resolved.pathname).trim().slice(0, 50) || '/',
            pathname: resolved.pathname,
          });
        }
      } catch {
        // ignore invalid href
      }
      if (navLinks.length >= 25) break;
    }

    // Collect accessible stylesheet rules so styling renders faithfully even behind strict CORS
    const inlinedStyles = [];
    for (const sheet of Array.from(document.styleSheets || [])) {
      try {
        if (sheet.cssRules) {
          const rulesText = Array.from(sheet.cssRules)
            .map((r) => r.cssText)
            .join('\n');
          if (rulesText) inlinedStyles.push(rulesText);
        }
      } catch {
        // Cross-origin stylesheet cannot be read via CSSOM; keep <link rel="stylesheet"> with absolute URL
      }
    }

    // Clone document to sanitize HTML safely
    const clone = document.documentElement.cloneNode(true);

    // Remove all scripts, noscripts, and dangerous meta tags
    clone.querySelectorAll('script, noscript, meta[http-equiv="Content-Security-Policy"]').forEach((n) => n.remove());

    // Strip inline event handlers and javascript: URIs
    clone.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const val = attr.value.trim().toLowerCase();
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
        } else if ((name === 'href' || name === 'src' || name === 'action') && val.startsWith('javascript:')) {
          el.setAttribute(attr.name, '#');
        }
      }

      // Resolve relative URLs to absolute URLs
      if (el.hasAttribute('src') && !el.getAttribute('src').startsWith('data:')) {
        try {
          el.setAttribute('src', new URL(el.getAttribute('src'), originUrl).href);
        } catch {}
      }
      if (el.hasAttribute('href') && !el.getAttribute('href').startsWith('#')) {
        try {
          el.setAttribute('href', new URL(el.getAttribute('href'), originUrl).href);
        } catch {}
      }
    });

    // Inject <base> and inlined CSS rules inside <head>
    let head = clone.querySelector('head');
    if (!head) {
      head = document.createElement('head');
      clone.insertBefore(head, clone.firstChild);
    }
    const existingBase = head.querySelector('base');
    if (existingBase) existingBase.remove();
    const baseEl = document.createElement('base');
    baseEl.setAttribute('href', originUrl);
    head.insertBefore(baseEl, head.firstChild);

    if (inlinedStyles.length > 0) {
      // Remove style/link tags that were already successfully inlined to avoid duplicate rules,
      // while keeping external <link rel="stylesheet"> that threw SecurityError
      const styleTag = document.createElement('style');
      styleTag.setAttribute('data-revisex-inlined', 'true');
      styleTag.textContent = inlinedStyles.join('\n');
      head.appendChild(styleTag);
    }

    return {
      title: document.title || originUrl,
      finalUrl: window.location.href,
      snapshotHtml: '<!DOCTYPE html>\n' + clone.outerHTML,
      elements: elementMap,
      layers,
      navLinks,
      elementCount: Object.keys(elementMap).length,
    };
  }, baseUrl);
}
