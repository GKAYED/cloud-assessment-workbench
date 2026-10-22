/**
 * Text helpers for consistent title casing across the UI.
 */

export function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return value;
  const tokens = trimmed.split(/(\s+)/);
  let seenWord = false;

  const normalized = tokens.map((token) => {
    if (!token.trim()) return token;
    const hasLetters = /[A-Za-z]/.test(token);
    if (/^[A-Z0-9]{2,}$/.test(token)) {
      if (hasLetters) seenWord = true;
      return token;
    }
    const lower = token.toLowerCase();
    if (!seenWord && hasLetters) {
      seenWord = true;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    return lower;
  });

  return normalized.join('');
}
