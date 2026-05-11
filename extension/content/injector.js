/**
 * corrAL-edu Content Script — Injector
 * Runs on chatgpt.com, claude.ai, gemini.google.com
 * Captures prompt submission events and sends metrics to background.
 *
 * CRITICAL: We only capture METRICS (length, intent), never actual text.
 */

import { classifyIntent, extractMetrics } from './intentClassifier.js';

// Wait for the page to be idle before attaching
function init() {
  setupMutationObserver();
  attachToExistingInputs();
}

init();

// ── Site-specific selectors ──────────────────────────────────

const SITE_CONFIG = {
  'chatgpt.com': {
    inputSelector: 'textarea[id*="prompt"], div[contenteditable="true"]',
    submitOnEnter: true,
  },
  'claude.ai': {
    inputSelector: 'textarea[data-id="composer"]',
    submitOnEnter: true,
  },
  'gemini.google.com': {
    inputSelector: 'textarea[aria-label*="input"], div[contenteditable="true"]',
    submitOnEnter: true,
  },
};

function getSiteKey() {
  const host = window.location.hostname;
  if (host.includes('chatgpt.com')) return 'chatgpt.com';
  if (host.includes('claude.ai')) return 'claude.ai';
  if (host.includes('gemini.google')) return 'gemini.google.com';
  return null;
}

// ── Mutation Observer ─────────────────────────────────────────

let observer = null;

function setupMutationObserver() {
  observer = new MutationObserver(() => {
    attachToExistingInputs();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ── Input Attachment ─────────────────────────────────────────

function attachToExistingInputs() {
  const siteKey = getSiteKey();
  if (!siteKey) return;

  const config = SITE_CONFIG[siteKey];
  if (!config) return;

  // Try textarea approach
  const inputs = document.querySelectorAll(config.inputSelector);
  inputs.forEach(input => {
    if (input.dataset.corralAttached) return;
    input.dataset.corralAttached = 'true';
    attachListener(input, config);
  });
}

function attachListener(input, config) {
  // For contenteditable divs
  if (input.getAttribute('contenteditable') === 'true') {
    input.addEventListener('keydown', (e) => {
      if (config.submitOnEnter && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitFromContenteditable(input);
      }
    });
    return;
  }

  // For textareas
  input.addEventListener('keydown', (e) => {
    if (config.submitOnEnter && e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      submitFromTextarea(input);
    }
  });

  // Also catch button clicks (e.g., send button)
  const parent = input.closest('form') || input.parentElement;
  if (parent) {
    const buttons = parent.querySelectorAll('button[type="submit"], button[aria-label*="send"]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        // Small delay to let the value update
        setTimeout(() => submitFromTextarea(input), 100);
      });
    });
  }
}

// ── Submit Handlers ──────────────────────────────────────────

function submitFromTextarea(textarea) {
  const text = textarea.value.trim();
  if (!text) return;
  recordSubmission(text);
}

function submitFromContenteditable(el) {
  const text = el.textContent.trim();
  if (!text) return;
  recordSubmission(text);
}

async function recordSubmission(text) {
  // Extract ONLY metrics — no actual text
  const { promptLength, wordCount } = extractMetrics(text);
  const intent = classifyIntent(text);

  try {
    // Send metrics to background (not the actual text)
    await chrome.runtime.sendMessage({
      type: 'EXCHANGE_RECORDED',
      intent,
      promptLength,
      wordCount,
    });
  } catch (err) {
    // Extension context might be invalid (page refreshed mid-submit)
    console.warn('[corrAL-edu] Failed to record exchange:', err.message);
  }
}

// ── Cleanup on page unload ───────────────────────────────────

window.addEventListener('beforeunload', () => {
  if (observer) observer.disconnect();
});