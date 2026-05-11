/**
 * corrAL-edu Content Script — Injector (Single File)
 * Runs on chatgpt.com, claude.ai, gemini.google.com
 * Captures prompt submission events and sends metrics to background.
 *
 * CRITICAL: We only capture METRICS (length, intent), never actual text.
 */

// ── Exchange Count in sessionStorage ────────────────────────────
// We track exchange count in sessionStorage so:
// - It persists across page refreshes within the same tab
// - It's tab-specific (not shared across tabs)
// - It survives service worker restarts (SW reads from storage on restart)

const REFLECT_AFTER_KEY = 'corralReflectAfter';
const DEFAULT_N = 5;

// ── Intent Classifier (inline, no import needed) ───────────────
// Priority order: more specific patterns first (summarizing before explaining)
// to avoid "what is the bottom line" matching "what is" instead of "bottom line"

const INTENT_PATTERNS = [
  ['summarizing', /(summarize|tl;?dr|recap|wrap up|key points|bottom line|summary|in short|overall)/i],
  ['debugging', /(\berror\b|\bbug\b|\bfix\b|doesn't work|exception|\btraceback\b|\bissue\b|\bproblem\b|\bwrong\b|\bbroken\b|\bfail\b|typeerror|undefined|null is not|\bundefined\b)/i],
  ['brainstorming', /(\bidea\b|\bthink about\b|\bexplore\b|\bpossibilities\b|\boptions\b|\bapproach\b|\bdifferent ways\b|\bways to\b|\bcould we\b|\bwhat if\b|\bhow about\b)/i],
  ['explaining', /(\bunderstand\b|\bwhat is\b|\bhow does\b|\bexplain\b|\bclarify\b|\bdefinition\b|\btell me about\b|\bdescribe\b|\bmeaning\b|\bconcept\b)/i],
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
    panelAnchorSelector: 'main form',  // inject reflection panel near input form
  },
  'claude.ai': {
    inputSelector: 'textarea[data-id="composer"]',
    submitOnEnter: true,
    panelAnchorSelector: '[data-testid="composer"]',
  },
  'gemini.google.com': {
    inputSelector: 'textarea[name*="input"], div[contenteditable="true"]',
    submitOnEnter: true,
    panelAnchorSelector: '.input-container, [role="textbox"]',
  },
};

function getSiteKey() {
  const host = window.location.hostname;
  if (host.includes('chatgpt.com')) return 'chatgpt.com';
  if (host.includes('claude.ai')) return 'claude.ai';
  if (host.includes('gemini.google')) return 'gemini.google.com';
  return null;
}

// ── Exchange Count in sessionStorage ────────────────────────────
// We track exchange count in sessionStorage so:
// - It persists across page refreshes within the same tab
// - It's tab-specific (not shared across tabs)
// - It survives service worker restarts (SW reads from storage on restart)

function getExchangeCount() {
  return parseInt(sessionStorage.getItem('corralExchangeCount') || '0', 10);
}

function incrementExchangeCount() {
  const count = getExchangeCount() + 1;
  sessionStorage.setItem('corralExchangeCount', String(count));
  return count;
}

function getReflectAfterN() {
  return parseInt(sessionStorage.getItem(REFLECT_AFTER_KEY) || String(DEFAULT_N), 10);
}

function setReflectAfterN(n) {
  sessionStorage.setItem(REFLECT_AFTER_KEY, String(n));
}

// ── Init ───────────────────────────────────────────────────────

function init() {
  // Sync reflectAfterN from chrome.storage if not set
  chrome.storage.local.get([REFLECT_AFTER_KEY], (result) => {
    if (result[REFLECT_AFTER_KEY] !== undefined) {
      setReflectAfterN(result[REFLECT_AFTER_KEY]);
    }
  });

  setupMutationObserver();
  attachToExistingInputs();
}

init();

// ── Message Listener (from popup/background) ────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_REFLECT_AFTER') {
    setReflectAfterN(message.value);
    sendResponse({ ok: true });
  }
  return true;
});

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
    if (input._corralAttached) return;
    input._corralAttached = true;

    if (input.tagName === 'TEXTAREA') {
      attachTextareaHandlers(input);
    } else if (input.isContentEditable) {
      attachContenteditableHandlers(input);
    }
  });
}

function attachTextareaHandlers(input) {
  const form = input.closest('form');

  // Keydown — capture Enter (without modifiers)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const text = input.value.trim();
      if (text) {
        submitFromTextarea(input);
        if (form) {
          const evt = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(evt);
        }
      }
    }
  });

  // Auto-resize via ResizeObserver
  const resizeObserver = new ResizeObserver(() => {});
  resizeObserver.observe(input);
  input._corralResizeObserver = resizeObserver;
}

function attachContenteditableHandlers(input) {
  // Detect plain Enter (not Shift+Enter)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // Don't preventDefault — let the site handle it
      // Just capture the text BEFORE the site clears it
      // We'll do a short delay to get the text after the site processes it
      const text = input.textContent.trim();
      if (text) {
        setTimeout(() => {
          const current = input.textContent.trim();
          if (current) submitFromContenteditable(input);
        }, 50);
      }
    }
  });

  // Click on send button
  const parent = input.closest('form') || input.parentElement?.closest('form') || input.parentElement;
  if (parent) {
    const buttons = parent.querySelectorAll('button');
    buttons.forEach(btn => {
      if (btn._corralBtnAttached) return;
      btn._corralBtnAttached = true;
      btn.addEventListener('click', () => {
        setTimeout(() => {
          const text = input.textContent?.trim() || input.innerText?.trim();
          if (text) submitFromContenteditable(input);
        }, 150);
      });
    });
  }

  // ResizeObserver for auto-growing editors
  const resizeObserver = new ResizeObserver(() => {});
  resizeObserver.observe(input);
  input._corralResizeObserver = resizeObserver;
}

// ── Submit Handlers ────────────────────────────────────────────

function submitFromTextarea(textarea) {
  const text = textarea.value.trim();
  if (!text) return;
  handleSubmission(text);
}

function submitFromContenteditable(el) {
  const text = el.textContent.trim();
  if (!text) return;
  handleSubmission(text);
}

async function handleSubmission(text) {
  const { promptLength, wordCount } = extractMetrics(text);
  const intent = classifyIntent(text);

  // Increment exchange count BEFORE sending to background
  const exchangeCount = incrementExchangeCount();

  try {
    await chrome.runtime.sendMessage({
      type: 'EXCHANGE_RECORDED',
      intent,
      promptLength,
      wordCount,
      exchangeCount, // pass current count so SW can update session
    });
  } catch (err) {
    console.warn('[corrAL-edu] Failed to record exchange:', err.message);
  }

  // Check if we should show reflection panel
  checkReflectionTrigger(exchangeCount);
}

// ── Reflection Trigger ─────────────────────────────────────────

let reflectionShown = false;

async function checkReflectionTrigger(count) {
  // Already showed reflection this session?
  if (sessionStorage.getItem('corralReflectionDone') === '1') return;

  // Get configured N
  const n = getReflectAfterN();

  if (count >= n) {
    // Short delay so the AI response starts appearing first
    setTimeout(() => showReflectionPanel(), 2000);
  }
}

// ── Reflection Panel ───────────────────────────────────────────

function showReflectionPanel() {
  if (reflectionShown) return;
  reflectionShown = true;

  // Mark done in sessionStorage so reload doesn't trigger again
  sessionStorage.setItem('corralReflectionDone', '1');

  // Build and inject the panel
  const panel = document.createElement('div');
  panel.id = 'corral-reflection-panel';
  panel.innerHTML = `
    <style>
      #corral-reflection-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: #1a1a2e;
        border: 1px solid #3a3a5e;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e0e0e0;
      }
      #corral-reflection-panel h3 {
        margin: 0 0 12px 0;
        font-size: 16px;
        color: #fff;
      }
      #corral-reflection-panel p {
        margin: 0 0 16px 0;
        font-size: 13px;
        color: #a0a0c0;
        line-height: 1.5;
      }
      #corral-reflection-panel textarea {
        width: 100%;
        height: 100px;
        background: #12122a;
        border: 1px solid #3a3a5e;
        border-radius: 8px;
        color: #e0e0e0;
        padding: 10px;
        font-size: 13px;
        resize: vertical;
        box-sizing: border-box;
      }
      #corral-reflection-panel textarea:focus {
        outline: none;
        border-color: #6c63ff;
      }
      #corral-reflection-panel .buttons {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      #corral-reflection-panel button {
        flex: 1;
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        font-size: 13px;
        cursor: pointer;
        font-weight: 500;
      }
      #corral-reflection-panel button.primary {
        background: #6c63ff;
        color: #fff;
      }
      #corral-reflection-panel button.primary:hover {
        background: #5a52d4;
      }
      #corral-reflection-panel button.secondary {
        background: transparent;
        color: #8080a0;
        border: 1px solid #3a3a5e;
      }
      #corral-reflection-panel button.secondary:hover {
        color: #a0a0c0;
        border-color: #5a5a8e;
      }
      #corral-reflection-panel .saved-msg {
        display: none;
        color: #4ade80;
        font-size: 13px;
        margin-top: 10px;
        text-align: center;
      }
    </style>
    <h3>💭 Reflect</h3>
    <p>After ${getReflectAfterN()} exchanges — what did you learn?</p>
    <textarea id="corral-reflection-input" placeholder="I learned that..."></textarea>
    <div class="buttons">
      <button class="secondary" id="corral-skip-btn">Skip</button>
      <button class="primary" id="corral-save-btn">Save</button>
    </div>
    <div class="saved-msg" id="corral-saved-msg">✓ Reflection saved</div>
  `;

  document.body.appendChild(panel);

  // Button handlers
  panel.querySelector('#corral-save-btn').addEventListener('click', () => {
    const text = panel.querySelector('#corral-reflection-input').value.trim();
    saveReflection(text);
    panel.querySelector('#corral-save-btn').style.display = 'none';
    panel.querySelector('#corral-skip-btn').style.display = 'none';
    panel.querySelector('#corral-saved-msg').style.display = 'block';
    setTimeout(() => panel.remove(), 2000);
  });

  panel.querySelector('#corral-skip-btn').addEventListener('click', () => {
    sessionStorage.setItem('corralReflectionDone', '1');
    panel.remove();
  });
}

async function saveReflection(text) {
  try {
    await chrome.runtime.sendMessage({
      type: 'REFLECTION_SAVED',
      text: text || '',
    });
  } catch (err) {
    console.warn('[corrAL-edu] Failed to save reflection:', err.message);
  }
}

// ── Cleanup ────────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  if (observer) observer.disconnect();
  document.querySelectorAll('[_corralResizeObserver]').forEach(el => {
    if (el._corralResizeObserver) {
      el._corralResizeObserver.disconnect();
      delete el._corralResizeObserver;
    }
  });
});