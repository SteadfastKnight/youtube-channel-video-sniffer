// ── State ────────────────────────────────────────────────────────────────────
let state = 'idle'; // idle | searching | found | not_found | stopped
let scannedCount = 0;
let searchTitle = '';

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Combined selector for every YouTube layout we support. querySelectorAll with a
// comma list returns each element once, in document order — no manual dedup.
const TITLE_SELECTOR = [
  // New (2025) lockup view-model layout — one anchor per card
  'a.ytLockupMetadataViewModelTitle',
  // Rich-grid / older grid / list layouts
  'ytd-rich-item-renderer #video-title',
  'ytd-rich-grid-media #video-title',
  'ytd-grid-video-renderer #video-title',
  'ytd-video-renderer #video-title',
  'yt-formatted-string#video-title',
  'a#video-title',
].join(',');

// Card wrappers, used to highlight the whole tile once matched.
const CARD_SELECTOR =
  '.ytLockupViewModelHost, yt-lockup-view-model, ' +
  'ytd-rich-item-renderer, ytd-rich-grid-media, ' +
  'ytd-grid-video-renderer, ytd-video-renderer';

function getVideoTitleEls() {
  return document.querySelectorAll(TITLE_SELECTOR);
}

/**
 * Best title string from a title element.
 * textContent is clean + populated in the new layout; in older layouts it can be
 * blank until the card scrolls into view, so fall back to aria-label / title.
 * Whitespace is collapsed because pre-wrap nodes keep raw newlines/indentation.
 */
function titleText(el) {
  const raw =
    el.textContent ||
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    '';
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

function highlightCard(el) {
  const card = el.closest(CARD_SELECTOR) || el;
  card.style.outline = '3px solid #ff0000';
  card.style.borderRadius = '8px';
  setTimeout(() => {
    card.style.outline = '';
    card.style.borderRadius = '';
  }, 6000);
}

// ── Main search loop ─────────────────────────────────────────────────────────
async function runSearch() {
  const needle = searchTitle.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!needle) {
    state = 'not_found';
    return;
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
  await sleep(1000);

  let stableTicks = 0;
  let lastCount = -1;

  while (state === 'searching') {
    const els = getVideoTitleEls();
    scannedCount = els.length;

    // Scan every loaded title once (single DOM query reused).
    for (const el of els) {
      if (titleText(el).includes(needle)) {
        state = 'found';
        await sleep(300);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightCard(el);
        return;
      }
    }

    // Track whether new videos appeared.
    if (scannedCount > lastCount) {
      stableTicks = 0;
      lastCount = scannedCount;
    } else {
      stableTicks++;
    }

    // ~5 idle ticks (≈9 s) with no new content → assume end of list.
    if (stableTicks >= 5) {
      state = 'not_found';
      return;
    }

    // Jump to the bottom so YouTube lazy-loads the next batch, then wait.
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    await sleep(1800);
  }
}

// ── Message handler ──────────────────────────────────────────────────────────
// Persistent listener replying synchronously from shared mutable state — avoids
// the "message port closed" error that breaks async sendResponse.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'start') {
    state = 'searching';
    scannedCount = 0;
    searchTitle = msg.title;
    runSearch(); // fire-and-forget async loop
    sendResponse({ ok: true });
  } else if (msg.action === 'stop') {
    state = 'stopped';
    sendResponse({ ok: true });
  } else if (msg.action === 'status') {
    sendResponse({ state, count: scannedCount });
  }
  // No `return true` — every branch responds synchronously.
});
