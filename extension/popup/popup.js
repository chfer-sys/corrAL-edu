/**
 * corrAL-edu Popup UI Logic
 */

const REFLECT_AFTER_KEY = 'corralReflectAfter';

document.addEventListener('DOMContentLoaded', async () => {
  await loadSessionStatus();
  await loadReflectSetting();
  setupButtons();
});

async function loadSessionStatus() {
  const dot = document.getElementById('statusDot');
  const siteVal = document.getElementById('siteValue');
  const exchangeCountEl = document.getElementById('exchangeCount');
  const lastIntentEl = document.getElementById('lastIntent');

  try {
    const session = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });
    if (session && session.sessionId) {
      dot.classList.remove('inactive');
      siteVal.textContent = session.site || 'unknown';
      exchangeCountEl.textContent = session.exchangeCount || 0;
      const exchanges = session.exchanges || [];
      if (exchanges.length > 0) {
        lastIntentEl.textContent = exchanges[exchanges.length - 1].intent;
      }
    } else {
      dot.classList.add('inactive');
      siteVal.textContent = 'No active session';
      exchangeCountEl.textContent = '0';
      lastIntentEl.textContent = '—';
    }
  } catch {
    dot.classList.add('inactive');
    siteVal.textContent = 'Error loading';
  }
}

async function loadReflectSetting() {
  const input = document.getElementById('reflectAfterN');
  // Load from chrome.storage.local (the canonical store)
  const result = await new Promise(resolve => {
    chrome.storage.local.get([REFLECT_AFTER_KEY], resolve);
  });
  if (result[REFLECT_AFTER_KEY] !== undefined) {
    input.value = result[REFLECT_AFTER_KEY];
  }
  // Also sync to sessionStorage for content script
  await syncToSessionStorage(result[REFLECT_AFTER_KEY] || 5);
}

async function syncToSessionStorage(n) {
  try {
    // Notify all tabs to update their sessionStorage
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && /^https:\/\/(chatgpt\.com|claude\.ai|gemini\.google\.com)/.test(tab.url)) {
        chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_REFLECT_AFTER', value: n }).catch(() => {});
      }
    }
  } catch {}
}

function setupButtons() {
  // Reflect after N — save on change
  const reflectInput = document.getElementById('reflectAfterN');
  reflectInput.addEventListener('change', async () => {
    const n = parseInt(reflectInput.value, 10);
    if (n < 1 || n > 20 || isNaN(n)) {
      showStatus('Enter a number 1–20', true);
      reflectInput.value = 5;
      return;
    }
    await new Promise(resolve => {
      chrome.storage.local.set({ [REFLECT_AFTER_KEY]: n }, resolve);
    });
    // Broadcast to content scripts
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && /^https:\/\/(chatgpt\.com|claude\.ai|gemini\.google\.com)/.test(tab.url || '')) {
        chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_REFLECT_AFTER', value: n }).catch(() => {});
      }
    }
    showStatus(`Reflect after ${n} exchanges`);
  });

  document.getElementById('openDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: 'dashboard/index.html' });
  });

  document.getElementById('clearData').addEventListener('click', async () => {
    if (confirm('Clear all corrAL-edu session data? This cannot be undone.')) {
      await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' });
      await loadSessionStatus();
      showStatus('Data cleared');
    }
  });
}

let statusTimer;
function showStatus(msg, isError = false) {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.style.color = isError ? '#f87171' : '#22c55e';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ''; }, 3000);
}