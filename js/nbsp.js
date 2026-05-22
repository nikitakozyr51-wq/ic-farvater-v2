/**
 * IC Фарватер v2 — NBSP automation
 * Запрет висящих предлогов: после 1/2/3-letter prep/conj → NBSP (U+00A0).
 *
 * Source: memory feedback_no_hanging_prepositions (Валентина 2026-05-22).
 *
 * Words list:
 *   1-letter: а в и к о с у я
 *   2-letter: во за из ко на не об от по со до но же ни то бы ли
 *   3-letter: для или при что под над без про
 *
 * Применяется ко ВСЕМУ текстовому контенту страницы (рекурсивно).
 */

(function () {
  'use strict';

  const SHORT_WORDS = [
    // 1-letter
    'а', 'в', 'и', 'к', 'о', 'с', 'у', 'я',
    // 2-letter
    'во', 'за', 'из', 'ко', 'на', 'не', 'об', 'от', 'по', 'со',
    'до', 'но', 'же', 'ни', 'то', 'бы', 'ли',
    // 3-letter
    'для', 'или', 'при', 'что', 'под', 'над', 'без', 'про',
  ];

  // Build regex once
  const wordsPattern = SHORT_WORDS.join('|');
  // Match: [boundary char] + [short word] + [whitespace] + [lookahead: Cyrillic/digit/quote]
  const NBSP_REGEX = new RegExp(
    '([\\s(«\\[—–-])(' + wordsPattern + ')\\s+(?=[А-ЯЁа-яё0-9«])',
    'gi'
  );
  // Edge case: text starts with a short word
  const NBSP_REGEX_START = new RegExp(
    '^(' + wordsPattern + ')\\s+(?=[А-ЯЁа-яё0-9«])',
    'i'
  );

  function applyNbsp(rootEl) {
    if (!rootEl) return;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // Skip script/style content
        const tag = node.parentElement && node.parentElement.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE') {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      let text = node.nodeValue;
      // Replace mid-text occurrences
      text = text.replace(NBSP_REGEX, '$1$2 ');
      // Replace start-of-text occurrence
      text = text.replace(NBSP_REGEX_START, '$1 ');
      if (text !== node.nodeValue) {
        node.nodeValue = text;
      }
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyNbsp(document.body));
  } else {
    applyNbsp(document.body);
  }

  // Expose for re-running after dynamic content
  window.applyNbsp = applyNbsp;
})();
