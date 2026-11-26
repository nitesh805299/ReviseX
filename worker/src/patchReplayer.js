import { ALLOWED_STYLE_PROPERTIES, CHANGE_TYPES, matchFingerprint } from './shared/patchEngine.js';

/**
 * Replays saved change patches onto the live Playwright page DOM.
 * Verifies element fingerprints before mutating any node; uncertain elements are
 * returned as unresolved without applying incorrect edits.
 */
export async function replayPatchesInPlaywright(page, patches = []) {
  if (!Array.isArray(patches) || patches.length === 0) {
    return { applied: [], unresolved: [] };
  }

  const allowedStyleProps = Array.from(ALLOWED_STYLE_PROPERTIES);

  const candidates = await page.evaluate(() => {
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

    const result = [];
    document.querySelectorAll('[data-revisex-id]').forEach((el) => {
      const attrSeed = [
        el.getAttribute('src') || '',
        el.getAttribute('href') || '',
        el.getAttribute('alt') || '',
        el.getAttribute('type') || '',
        el.getAttribute('role') || '',
        el.getAttribute('aria-label') || '',
      ].join('|');

      result.push({
        elementId: el.getAttribute('data-revisex-id'),
        fingerprint: {
          tagName: el.tagName.toLowerCase(),
          domId: el.id || '',
          cssPath: getCssPath(el),
          nthPath: getNthPath(el),
          classSignature: Array.from(el.classList || [])
            .filter((c) => !c.startsWith('revisex-'))
            .sort()
            .join(' '),
          textSnippet: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          attributesHash: simpleHash(attrSeed),
        },
      });
    });
    return result;
  });

  const byId = new Map(candidates.map((c) => [c.elementId, c]));
  const applied = [];
  const unresolved = [];
  const verifiedPatches = [];

  for (const patch of patches) {
    let target = byId.get(patch.elementId);
    let matchResult = target ? matchFingerprint(patch.elementFingerprint, target.fingerprint) : { matched: false, score: 0 };

    // Fallback: search by fingerprint across all tagged candidates
    if (!matchResult.matched && patch.elementFingerprint) {
      let bestCandidate = null;
      let bestScore = 0;
      for (const candidate of candidates) {
        const res = matchFingerprint(patch.elementFingerprint, candidate.fingerprint);
        if (res.matched && res.score > bestScore) {
          bestScore = res.score;
          bestCandidate = candidate;
        }
      }
      if (bestCandidate) {
        target = bestCandidate;
        matchResult = { matched: true, score: bestScore, reason: 'Matched via fallback fingerprint' };
      }
    }

    if (!target || !matchResult.matched) {
      unresolved.push({
        changeId: patch._id || patch.id || patch.clientId,
        elementId: patch.elementId,
        reason: matchResult.reason || 'Element not found on current page',
      });
      continue;
    }

    verifiedPatches.push({
      resolvedElementId: target.elementId,
      patch,
    });
    applied.push({
      changeId: patch._id || patch.id || patch.clientId,
      resolvedElementId: target.elementId,
      confidence: matchResult.score,
    });
  }

  // Apply only verified patches in the live Playwright DOM
  if (verifiedPatches.length > 0) {
    await page.evaluate(
      ({ items, allowedProps, changeTypes }) => {
        const allowedSet = new Set(allowedProps);
        for (const { resolvedElementId, patch } of items) {
          const el = document.querySelector(`[data-revisex-id="${CSS.escape(resolvedElementId)}"]`);
          if (!el) continue;

          if (patch.type === changeTypes.TEXT) {
            const val = typeof patch.proposedValue === 'object' ? patch.proposedValue?.text : patch.proposedValue;
            if (typeof val === 'string') {
              el.textContent = val;
            }
          } else if (patch.type === changeTypes.IMAGE) {
            const src = typeof patch.proposedValue === 'object' ? patch.proposedValue?.src : patch.proposedValue;
            const alt = typeof patch.proposedValue === 'object' ? patch.proposedValue?.alt : undefined;
            if (typeof src === 'string' && src) {
              el.setAttribute('src', src);
              el.removeAttribute('srcset');
            }
            if (typeof alt === 'string') {
              el.setAttribute('alt', alt);
            }
          } else if (
            patch.type === changeTypes.STYLE ||
            patch.type === changeTypes.LAYOUT ||
            patch.type === changeTypes.VISIBILITY
          ) {
            const styleObj = patch.proposedValue;
            if (styleObj && typeof styleObj === 'object') {
              for (const [prop, val] of Object.entries(styleObj)) {
                if (allowedSet.has(prop) && val !== undefined && val !== null) {
                  el.style[prop] = String(val);
                }
              }
            }
          } else if (patch.type === changeTypes.MOVE) {
            const move = patch.proposedValue;
            if (move && typeof move === 'object' && move.direction) {
              const parent = el.parentElement;
              if (parent) {
                if (move.direction === 'up' && el.previousElementSibling) {
                  parent.insertBefore(el, el.previousElementSibling);
                } else if (move.direction === 'down' && el.nextElementSibling) {
                  parent.insertBefore(el.nextElementSibling, el);
                }
              }
            }
          }
        }
      },
      { items: verifiedPatches, allowedProps: allowedStyleProps, changeTypes: CHANGE_TYPES }
    );
  }

  return { applied, unresolved };
}
