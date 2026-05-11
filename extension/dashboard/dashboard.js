/**
 * corrAL-edu Teacher Dashboard — Vanilla JS
 * Displays session metrics, intent breakdown, reflection stats.
 * Features: intent bar chart, date filter, engagement flags, activity trend, session detail expand.
 */

const INTENT_COLORS = {
  debugging: '#ef4444',
  explaining: '#6366f1',
  brainstorming: '#22c55e',
  summarizing: '#f59e0b',
  other: '#475569'
};
const INTENT_ORDER = ['debugging', 'explaining', 'brainstorming', 'summarizing', 'other'];

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  setupFilters();
  setupEventListeners();
});

// ── Main Load ──────────────────────────────────────────────────

let allSessions = [];

async function loadDashboard() {
  try {
    allSessions = await chrome.runtime.sendMessage({ type: 'GET_ALL_SESSIONS' }) || [];
    const stats = await chrome.runtime.sendMessage({ type: 'GET_STORAGE_STATS' }) || {};

    applyFilters();
    renderStats(allSessions, stats);
    renderActivityChart(allSessions);
  } catch (err) {
    document.getElementById('sessionsTableBody').innerHTML =
      '<tr><td colspan="7" class="empty">Error loading data. Is the extension installed?</td></tr>';
  }
}

// ── Filters ─────────────────────────────────────────────────────

function setupFilters() {
  const btns = document.querySelectorAll('.filter-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  });

  document.getElementById('filterFrom').addEventListener('change', applyFilters);
  document.getElementById('filterTo').addEventListener('change', applyFilters);
}

function applyFilters() {
  const activeBtn = document.querySelector('.filter-btn.active');
  const range = activeBtn ? activeBtn.dataset.range : '30';

  let fromDate = null, toDate = null;

  if (range !== 'all') {
    const days = parseInt(range, 10);
    toDate = new Date();
    fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
  } else {
    const fromInput = document.getElementById('filterFrom').value;
    const toInput = document.getElementById('filterTo').value;
    if (fromInput) fromDate = new Date(fromInput);
    if (toInput) toDate = new Date(toInput);
  }

  const filtered = allSessions.filter(s => {
    const t = new Date(s.startTime);
    if (fromDate && t < fromDate) return false;
    if (toDate && t > toDate) return false;
    return true;
  });

  renderSessionsTable(filtered);
  document.getElementById('filterCount').textContent =
    allSessions.length !== filtered.length
      ? `Showing ${filtered.length} of ${allSessions.length} sessions`
      : `${filtered.length} sessions`;
}

// ── Stats ──────────────────────────────────────────────────────

function renderStats(sessions, storageStats) {
  const totalSessions = sessions.length;
  const totalExchanges = sessions.reduce((sum, s) => sum + (s.exchangeCount || 0), 0);
  const avgExchanges = totalSessions ? (totalExchanges / totalSessions).toFixed(1) : '0';

  const withReflection = sessions.filter(s => s.reflectionText).length;
  const reflectionRate = totalSessions ? Math.round((withReflection / totalSessions) * 100) : 0;

  // High-engagement: sessions with 4+ exchanges
  const highEngagement = sessions.filter(s => (s.exchangeCount || 0) >= 4).length;
  const engagementRate = totalSessions ? Math.round((highEngagement / totalSessions) * 100) : 0;

  document.getElementById('totalSessions').textContent = totalSessions;
  document.getElementById('avgExchanges').textContent = avgExchanges;
  document.getElementById('reflectionRate').textContent = reflectionRate + '%';
  document.getElementById('engagementRate').textContent = engagementRate + '%';

  const el = document.getElementById('engagementRate');
  el.className = 'stat-value' + (engagementRate < 50 ? ' warning' : '');

  const usedKB = storageStats?.usedKB || 0;
  document.getElementById('storageUsed').textContent = usedKB < 1024
    ? Math.round(usedKB) + ' KB'
    : (usedKB / 1024).toFixed(1) + ' MB';
}

// ── Activity Chart (last 7 days) ───────────────────────────────

function renderActivityChart(sessions) {
  const chart = document.getElementById('activityChart');
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);

    const daySessions = sessions.filter(s => {
      const t = new Date(s.startTime);
      return t >= d && t < nextDay;
    });

    const exchangeCount = daySessions.reduce((sum, s) => sum + (s.exchangeCount || 0), 0);
    const intents = daySessions.flatMap(s => (s.exchanges || []).map(e => e.intent));

    // Stacked segments: debugging / explaining / brainstorming / summarizing
    const counts = {};
    INTENT_ORDER.forEach(intent => {
      counts[intent] = intents.filter(i => i === intent).length;
    });

    days.push({
      label: d.toLocaleDateString('en-SG', { weekday: 'short' }),
      date: d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' }),
      total: exchangeCount,
      counts,
      sessions: daySessions.length
    });
  }

  const maxTotal = Math.max(...days.map(d => d.total), 1);

  chart.innerHTML = days.map(d => {
    const segments = INTENT_ORDER
      .filter(intent => d.counts[intent] > 0)
      .map(intent => {
        const heightPct = (d.counts[intent] / maxTotal) * 100;
        return `<div class="bar" style="height:${heightPct}%;background:${INTENT_COLORS[intent]};flex:${d.counts[intent]};" title="${intent}: ${d.counts[intent]}"></div>`;
      }).join('');

    return `
      <div class="bar-wrap" title="${d.date}: ${d.total} exchanges (${d.sessions} sessions)">
        <div style="display:flex;align-items:flex-end;height:50px;width:100%;gap:1px;">
          ${segments || '<div class="bar" style="height:2px;width:100%;background:#1e293b;"></div>'}
        </div>
        <span class="bar-label">${d.label}</span>
      </div>
    `;
  }).join('');
}

// ── Sessions Table ──────────────────────────────────────────────

function renderSessionsTable(sessions) {
  const tbody = document.getElementById('sessionsTableBody');

  if (!sessions.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No sessions match your filter. Try a wider date range.</td></tr>';
    return;
  }

  // Most recent first
  const sorted = [...sessions].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  tbody.innerHTML = sorted.map(s => {
    const startDate = new Date(s.startTime).toLocaleDateString('en-SG', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    const exchanges = s.exchanges || [];
    const exchangeCount = s.exchangeCount || 0;

    // Intent bar
    const counts = {};
    INTENT_ORDER.forEach(intent => {
      counts[intent] = exchanges.filter(e => e.intent === intent).length;
    });
    const total = exchanges.length || 1;

    const intentBar = INTENT_ORDER
      .filter(intent => counts[intent] > 0)
      .map(intent => {
        const width = Math.round((counts[intent] / total) * 100);
        return `<div class="intent-bar-segment ${intent}" style="width:${width}%;" title="${intent}: ${counts[intent]}"></div>`;
      }).join('');

    const intentCountsStr = INTENT_ORDER
      .filter(intent => counts[intent] > 0)
      .map(intent => `${counts[intent]} ${intent.slice(0,4)}`)
      .join(', ');

    // Flags
    const flags = [];
    if (exchangeCount < 3) flags.push('<span class="flag low">low engagement</span>');
    if (exchangeCount >= 5) {
      const debugCount = counts['debugging'] || 0;
      if (debugCount / total > 0.6) flags.push('<span class="flag high-debug">high debugging</span>');
    }
    if (!s.reflectionText) flags.push('<span class="flag no-reflection">no reflection</span>');

    const hasReflection = s.reflectionText
      ? `<span style="color:#22c55e;">✓</span>`
      : `<span style="color:#475569;">—</span>`;

    const detailId = `detail-${s.sessionId}`;

    return `
      <tr class="clickable" onclick="toggleDetail('${s.sessionId}')">
        <td style="width:24px;text-align:center;color:#64748b;"><span class="expand-arrow">▶</span></td>
        <td>${startDate}</td>
        <td>${s.site || 'unknown'}</td>
        <td>${exchangeCount}</td>
        <td class="intent-bar-cell">
          <div class="intent-bar-wrap">${intentBar || '<div class="intent-bar-segment other" style="width:100%;"></div>'}</div>
          <div class="intent-counts">${intentCountsStr || 'no data'}</div>
        </td>
        <td>${flags.join('')}</td>
        <td>${hasReflection}</td>
      </tr>
      <tr>
        <td colspan="7" style="padding:0;">
          <div class="detail-panel" id="${detailId}">
            ${renderDetailPanel(s)}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Store sessions for toggle
  window._sessionsMap = {};
  sessions.forEach(s => { window._sessionsMap[s.sessionId] = s; });
}

function renderDetailPanel(s) {
  const exchanges = s.exchanges || [];
  const timeline = exchanges.length
    ? exchanges.map((e, i) => `
        <div class="exchange-item">
          <span class="num">#${i + 1}</span>
          <span class="intent-tag ${e.intent}">${e.intent}</span>
          <span class="meta">${e.wordCount}w · ${e.promptLength}ch</span>
        </div>
      `).join('')
    : '<div style="color:#64748b;font-size:0.8125rem;">No exchanges recorded.</div>';

  const reflection = s.reflectionText
    ? `<pre>${escapeHtml(s.reflectionText)}</pre>`
    : `<p style="color:#64748b;font-size:0.8125rem;">No reflection submitted.</p>`;

  return `
    <div class="detail-grid">
      <div class="detail-block">
        <h4>Exchange Timeline (${exchanges.length})</h4>
        <div class="exchange-timeline">${timeline}</div>
      </div>
      <div class="detail-block">
        <h4>Reflection</h4>
        ${reflection}
        <h4 style="margin-top:0.75rem;">Session Info</h4>
        <p>Started: ${new Date(s.startTime).toLocaleString('en-SG')}</p>
        <p>Site: ${s.site || 'unknown'}</p>
        <p>Exchanges: ${s.exchangeCount || 0}</p>
        ${s.endTime ? `<p>Ended: ${new Date(s.endTime).toLocaleString('en-SG')}</p>` : ''}
      </div>
    </div>
  `;
}

function toggleDetail(sessionId) {
  const panel = document.getElementById(`detail-${sessionId}`);
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open');

  // Update arrow
  const row = panel.previousElementSibling;
  if (isOpen) {
    row.classList.remove('expanded');
    row.querySelector('.expand-arrow').textContent = '▶';
  } else {
    row.classList.add('expanded');
    row.querySelector('.expand-arrow').textContent = '▼';
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Event Listeners ─────────────────────────────────────────────

function setupEventListeners() {
  document.getElementById('refreshData').addEventListener('click', loadDashboard);

  document.getElementById('exportCSV').addEventListener('click', async () => {
    const sessions = await chrome.runtime.sendMessage({ type: 'GET_ALL_SESSIONS' }) || [];
    exportCSV(sessions);
  });
}

// ── CSV Export ─────────────────────────────────────────────────

function exportCSV(sessions) {
  if (!sessions.length) { alert('No sessions to export.'); return; }

  const header = 'Session ID,Start Time,End Time,Site,Exchange Count,Intents (debugging),Intents (explaining),Intents (brainstorming),Intents (summarizing),Intents (other),Reflection Rate,Storage\n';
  const rows = sessions.map(s => {
    const exchanges = s.exchanges || [];
    const countOf = intent => exchanges.filter(e => e.intent === intent).length;
    const intents = INTENT_ORDER.map(intent => countOf(intent)).join(',');
    const hasReflection = s.reflectionText ? 1 : 0;
    return [
      s.sessionId,
      s.startTime,
      s.endTime || '',
      s.site || '',
      s.exchangeCount || 0,
      intents,
      hasReflection
    ].join(',');
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