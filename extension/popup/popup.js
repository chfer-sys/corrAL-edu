/**
 * corrAL-edu Popup UI Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadSessionStatus();
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

function setupButtons() {
  document.getElementById('openDashboard').addEventListener('click', () => {
    // Open dashboard in a new tab
    chrome.tabs.create({ url: 'dashboard/index.html' });
  });

  document.getElementById('clearData').addEventListener('click', async () => {
    if (confirm('Clear all corrAL-edu session data? This cannot be undone.')) {
      await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' });
      await loadSessionStatus();
    }
  });
}