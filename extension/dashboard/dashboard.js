/**
 * corrAL-edu Teacher Dashboard — Vanilla JS
 * Displays session metrics, intent breakdown, reflection stats.
 * No framework, single file.
 */

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  setupEventListeners();
});

async function loadDashboard() {
  try {
    const sessions = await chrome.runtime.sendMessage({ type: 'GET_ALL_SESSIONS' }) || [];
    const stats = await chrome.runtime.sendMessage({ type: 'GET_STORAGE_STATS' }) || {};

    renderStats(sessions);
    renderSessionsTable(sessions);
  } catch (err) {
    document.getElementById('sessionsTable').innerHTML =
      '<div class="empty">Error loading data. Is the extension installed?</div>';
  }
}

function renderStats(sessions) {
  const totalSessions = sessions.length;
  const totalExchanges = sessions.reduce((sum, s) => sum + (s.exchangeCount || 0), 0);
  const avgExchanges = totalSessions ? (totalExchanges / totalSessions).toFixed(1) : '0';

  const withReflection = sessions.filter(s => s.reflectionText).length;
  const reflectionRate = totalSessions ? Math.round((withReflection / totalSessions) * 100) : 0;

  document.getElementById('totalSessions').textContent = totalSessions;
  document.getElementById('avgExchanges').textContent = avgExchanges;
  document.getElementById('reflectionRate').textContent = reflectionRate + '%';
  document.getElementById('storageUsed').textContent = (stats?.usedMB || '0') + ' MB';
}

function renderSessionsTable(sessions) {
  const container = document.getElementById('sessionsTable');

  if (!sessions.length) {
    container.innerHTML = '<div class="empty">No sessions yet. Install the extension and have students use ChatGPT, Claude, or Gemini.</div>';
    return;
  }

  // Show last 20 sessions, most recent first
  const recent = sessions.slice(0, 20);

  const rows = recent.map(s => {
    const startDate = new Date(s.startTime).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const exchanges = s.exchanges || [];
    const intents = [...new Set(exchanges.map(e => e.intent))].join(', ') || '—';
    const hasReflection = s.reflectionText ? '✓' : '—';

    return `<tr>
      <td>${startDate}</td>
      <td>${s.site || 'unknown'}</td>
      <td>${s.exchangeCount || 0}</td>
      <td><span class="intent-badge">${intents}</span></td>
      <td>${hasReflection}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Site</th>
          <th>Exchanges</th>
          <th>Intents</th>
          <th>Reflected</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function setupEventListeners() {
  document.getElementById('refreshData').addEventListener('click', loadDashboard);

  document.getElementById('exportCSV').addEventListener('click', async () => {
    const sessions = await chrome.runtime.sendMessage({ type: 'GET_ALL_SESSIONS' }) || [];
    exportCSV(sessions);
  });
}

function exportCSV(sessions) {
  if (!sessions.length) {
    alert('No sessions to export.');
    return;
  }

  const header = 'Session ID,Start Time,End Time,Site,Exchange Count,Intents,Reflection Rate,Storage Used\n';
  const rows = sessions.map(s => {
    const intents = (s.exchanges || []).map(e => e.intent).join('; ');
    const hasReflection = s.reflectionText ? 1 : 0;
    return `${s.sessionId},${s.startTime},${s.endTime || ''},${s.site || ''},${s.exchangeCount || 0},"${intents}",${hasReflection}`;
  }).join('\n');

  const csv = header + rows;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `corral-edu-sessions-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}