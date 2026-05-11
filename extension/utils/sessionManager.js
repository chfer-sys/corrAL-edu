/**
 * corrAL-edu Session Manager
 * Handles session lifecycle — create, update, close.
 * All data is metrics-only (no prompt/response text).
 */

import { upsertSession, getSession } from './storage.js';

let currentSession = null;

/**
 * Start a new session for a given site.
 */
export function startSession(site) {
  currentSession = {
    sessionId: generateId(),
    startTime: new Date().toISOString(),
    endTime: null,
    site: normalizeSite(site),
    exchangeCount: 0,
    exchanges: [],
    reflectionText: null,
    reflectionTriggered: false,
  };
  upsertSession(currentSession);
  return currentSession;
}

/**
 * Record an exchange (prompt submitted).
 * NOTE: We log METRICS only — no actual text.
 */
export async function recordExchange(intent, promptLength, wordCount) {
  if (!currentSession) return null;

  const exchange = {
    index: currentSession.exchangeCount,
    timestamp: new Date().toISOString(),
    intent,
    promptLength,
    wordCount,
    hasReflection: false,
  };

  currentSession.exchanges.push(exchange);
  currentSession.exchangeCount++;
  await upsertSession(currentSession);
  return currentSession;
}

/**
 * Trigger reflection prompt after N exchanges.
 */
export function shouldTriggerReflection(exchangeCount, threshold = 5) {
  return exchangeCount > 0 && exchangeCount % threshold === 0;
}

/**
 * Record reflection text.
 */
export async function recordReflection(text) {
  if (!currentSession) return null;
  currentSession.reflectionText = text;
  if (currentSession.exchanges.length > 0) {
    currentSession.exchanges[currentSession.exchanges.length - 1].hasReflection = true;
  }
  await upsertSession(currentSession);
  return currentSession;
}

/**
 * End current session.
 */
export async function endSession() {
  if (!currentSession) return null;
  currentSession.endTime = new Date().toISOString();
  await upsertSession(currentSession);
  const finished = currentSession;
  currentSession = null;
  return finished;
}

/**
 * Get current active session.
 */
export function getCurrentSession() {
  return currentSession;
}

/**
 * Restore session by ID (e.g., after page reload).
 */
export async function restoreSession(sessionId) {
  const session = await getSession(sessionId);
  if (session && !session.endTime) {
    currentSession = session;
    return session;
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function normalizeSite(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('chatgpt.com')) return 'chatgpt.com';
    if (u.hostname.includes('claude.ai')) return 'claude.ai';
    if (u.hostname.includes('gemini.google')) return 'gemini.google.com';
    return u.hostname;
  } catch {
    return 'unknown';
  }
}