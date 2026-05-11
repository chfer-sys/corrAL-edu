/**
 * corrAL-edu Storage Utility
 * Chrome Storage API wrapper with session persistence.
 */

const STORAGE_KEY = 'corral_edu_sessions';
const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024; // 10MB Chrome limit

/**
 * Get all sessions from Chrome Storage.
 * Returns empty array if none exist.
 */
export async function getSessions() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

/**
 * Save sessions to Chrome Storage.
 * Prunes sessions older than 90 days if storage is near limit.
 */
export async function saveSessions(sessions) {
  const data = JSON.stringify(sessions);
  if (data.length > STORAGE_LIMIT_BYTES * 0.9) {
    sessions = pruneOldSessions(sessions, 90);
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: sessions });
}

/**
 * Add or update a session.
 */
export async function upsertSession(session) {
  const sessions = await getSessions();
  const idx = sessions.findIndex(s => s.sessionId === session.sessionId);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  await saveSessions(sessions);
}

/**
 * Get a session by ID.
 */
export async function getSession(sessionId) {
  const sessions = await getSessions();
  return sessions.find(s => s.sessionId === sessionId);
}

/**
 * Delete sessions older than `days` days.
 */
function pruneOldSessions(sessions, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return sessions.filter(s => new Date(s.startTime).getTime() > cutoff);
}

/**
 * Get storage usage stats.
 */
export async function getStorageStats() {
  const bytes = await chrome.storage.local.getBytesInUse(STORAGE_KEY);
  return {
    usedBytes: bytes,
    usedMB: (bytes / 1024 / 1024).toFixed(2),
    limitMB: (STORAGE_LIMIT_BYTES / 1024 / 1024).toFixed(0),
    percentUsed: ((bytes / STORAGE_LIMIT_BYTES) * 100).toFixed(1),
  };
}

/**
 * Clear all session data.
 */
export async function clearAllSessions() {
  await chrome.storage.local.remove(STORAGE_KEY);
}