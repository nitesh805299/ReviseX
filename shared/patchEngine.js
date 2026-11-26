export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, label: 'Desktop', deviceScaleFactor: 1, isMobile: false },
  tablet: { width: 768, height: 1024, label: 'Tablet', deviceScaleFactor: 1, isMobile: true },
  mobile: { width: 390, height: 844, label: 'Mobile', deviceScaleFactor: 2, isMobile: true },
};

export const CHANGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  STYLE: 'style',
  LAYOUT: 'layout',
  VISIBILITY: 'visibility',
  MOVE: 'move',
};

export const ALLOWED_STYLE_PROPERTIES = new Set([
  'color',
  'backgroundColor',
  'borderColor',
  'borderWidth',
  'borderStyle',
  'borderRadius',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'textAlign',
  'lineHeight',
  'letterSpacing',
  'width',
  'height',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'display',
  'visibility',
  'opacity',
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'flexDirection',
  'justifyContent',
  'alignItems',
  'gap',
  'gridTemplateColumns',
  'justifyItems',
]);

/**
 * Evaluates whether a candidate element fingerprint sufficiently matches a saved fingerprint.
 * Returns { matched: boolean, score: number, reason: string }
 */
export function matchFingerprint(savedFingerprint, candidateFingerprint) {
  if (!savedFingerprint || !candidateFingerprint) {
    return { matched: false, score: 0, reason: 'Missing fingerprint metadata' };
  }

  // Exact tag mismatch is a strong indicator of structural divergence
  if (
    savedFingerprint.tagName &&
    candidateFingerprint.tagName &&
    savedFingerprint.tagName.toLowerCase() !== candidateFingerprint.tagName.toLowerCase()
  ) {
    return { matched: false, score: 0, reason: `Tag mismatch (${savedFingerprint.tagName} vs ${candidateFingerprint.tagName})` };
  }

  let score = 0;
  let maxScore = 0;

  if (savedFingerprint.domId) {
    maxScore += 40;
    if (savedFingerprint.domId === candidateFingerprint.domId) score += 40;
  }

  if (savedFingerprint.cssPath) {
    maxScore += 30;
    if (savedFingerprint.cssPath === candidateFingerprint.cssPath) score += 30;
  }

  if (savedFingerprint.nthPath) {
    maxScore += 20;
    if (savedFingerprint.nthPath === candidateFingerprint.nthPath) score += 20;
  }

  if (savedFingerprint.classSignature) {
    maxScore += 10;
    if (savedFingerprint.classSignature === candidateFingerprint.classSignature) score += 10;
  }

  if (savedFingerprint.textSnippet) {
    maxScore += 15;
    if (
      candidateFingerprint.textSnippet &&
      savedFingerprint.textSnippet.slice(0, 40) === candidateFingerprint.textSnippet.slice(0, 40)
    ) {
      score += 15;
    }
  }

  if (savedFingerprint.attributesHash) {
    maxScore += 15;
    if (savedFingerprint.attributesHash === candidateFingerprint.attributesHash) score += 15;
  }

  if (maxScore === 0) {
    return { matched: false, score: 0, reason: 'Insufficient fingerprint attributes' };
  }

  const ratio = score / maxScore;
  const matched = ratio >= 0.55;
  return {
    matched,
    score: Math.round(ratio * 100),
    reason: matched ? 'Fingerprint verified' : `Confidence too low (${Math.round(ratio * 100)}%)`,
  };
}
