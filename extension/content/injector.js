/**
 * corrAL-edu Content Script — Injector (Single File)
 * Runs on chatgpt.com, claude.ai, gemini.google.com
 * Captures prompt submission events and sends metrics to background.
 *
 * CRITICAL: We only capture METRICS (length, intent), never actual text.
 */

// ── Intent Classifier (inline, no import needed) ───────────────

const INTENT_PATTERNS = [
  ['debugging', /(\berror\b|\bbug\b|\bfix\b|doesn't work|exception|\btraceback\b|\bissue\b|\bproblem\b|\bwrong\b|\bbroken\b|\bfail\b|typeerror|undefined|null is not|\bundefined\b)/i],
  ['explaining', /(\bunderstand\b|\bwhat is\b|\bhow does\b|\bexplain\b|\bclarify\b|\bdefinition\b|\btell me about\b|\bdescribe\b|\bmeaning\b|\bconcept\b)/i],
  ['brainstorming', /(\bidea\b|\bthink about\b|\bexplore\b|\bpossibilities\b|\boptions\b|\bapproach\b|\bdifferent ways\b|\bways to\b|\bcould we\b|\bwhat if\b|\bhow about\b)/i],
  ['summarizing', /(summarize|tl;?dr|recap|wrap up|key points|bottom line|summary|in short|overall)/i],
];

function classifyIntent(promptText) {
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(promptText)) return intent;
  }
  return 'other';
}

function extractMetrics(promptText) {
  return {
    promptLength: promptText.length,
    wordCount: promptText.trim().split(/\s+/).length,
  };
}

// ── Site Config ────────────────────────────────────────────────

const SITE_CONFIG = {
  'chatgpt.com': {
    inputSelector: 'textarea[id*="prompt"], div[contenteditable="true"][role="textbox"]',
    submitOnEnter: true,
  },
  'claude.ai': {
    inputSelector: 'textarea[data-id="composer"]',
    submitOnEnter: true,
  },
  'gemini.google.com': {
    inputSelector: 'textarea[name*="input"], div[contenteditable="true"]',
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

// ── Init ───────────────────────────────────────────────────────

function init() {
  setupMutationObserver();
  attachToExistingInputs();
}

init();

// ── Mutation Observer ──────────────────────────────────────────

let observer = null;

function setupMutationObserver() {
  observer = new MutationObserver(() => {
    attachToExistingInputs();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ── Input Attachment ────────────────────────────────────────────

function attachToExistingInputs() {
  const siteKey = getSiteKey();
  if (!siteKey) return;

  const config = SITE_CONFIG[siteKey];
  if (!config) return;

  const inputs = document.querySelectorAll(config.inputSelector);
  inputs.forEach(input => {
    if (input.dataset.corralAttached) return;
    input.dataset.corralAttached = 'true';
    attachListener(input, config);
  });
}

function attachListener(input, config) {
  const form = input.closest('form');

  if (input.getAttribute('contenteditable') === 'true') {
    input.addEventListener('keydown', (e) => {
      if (config.submitOnEnter && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.textContent.trim();
        if (text) {
          recordSubmission(text);
          // Manually submit the form if found
          if (form) {
            // Create and dispatch submit event
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(submitEvent);
          }
        }
      }
    });
    return;
  }

  input.addEventListener('keydown', (e) => {
    if (config.submitOnEnter && e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const text = input.value.trim();
      if (text) {
        recordSubmission(text);
        // Manually submit the form if found
        if (form) {
          const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(submitEvent);
        }
      }
    }
  });

  // Catch send button clicks — also handle textarea resize events
  // Some chat UIs auto-resize textarea (scrollHeight changes) — detect this too
  const resizeObserver = new ResizeObserver(() => {
    // Textarea resized — content may have changed
  });
  resizeObserver.observe(input);

  // Store observer reference for cleanup
  input._corralResizeObserver = resizeObserver;

  // Only query buttons if parent (form) exists
  if (parent) {
    const buttons = parent.querySelectorAll('button[type="submit"], button[aria-label*="send" i], button[aria-label*="submit" i]');
    buttons.forEach(btn => {
      if (btn.dataset.corralAttached) return;
      btn.dataset.corralAttached = 'true';
      btn.addEventListener('click', () => {
        setTimeout(() => {
          const text = input.value?.trim() || input.textContent?.trim();
          if (text) submitFromTextarea(input);
        }, 150);
      });
    });
  }
}

// ── Submit Handlers ────────────────────────────────────────────

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
  const { promptLength, wordCount } = extractMetrics(text);
  const intent = classifyIntent(text);

  try {
    await chrome.runtime.sendMessage({
      type: 'EXCHANGE_RECORDED',
      intent,
      promptLength,
      wordCount,
    });
  } catch (err) {
    console.warn('[corrAL-edu] Failed to record exchange:', err.message);
  }
}

// ── Cleanup ────────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  if (observer) observer.disconnect();
  // Clean up ResizeObservers
  document.querySelectorAll('[_corralResizeObserver]').forEach(el => {
    if (el._corralResizeObserver) {
      el._corralResizeObserver.disconnect();
      delete el._corralResizeObserver;
    }
  });
});