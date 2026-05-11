/**
 * corrAL-edu Background Service Worker (Manifest V3)
 * Handles messaging between content scripts and storage.
 * Also manages session lifecycle across tab changes.
 */

import { getSessions, upsertSession, getSession, clearAllSessions, getStorageStats } from '../utils/storage.js';
import { startSession, endSession, getCurrentSession, restoreSession } from '../utils/sessionManager.js';

// ── Message Handlers ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'SESSION_START':
      return startSession(message.site);

    case 'SESSION_END':
      return await endSession();

    case 'EXCHANGE_RECORDED': {
      const { intent, promptLength, wordCount } = message;
      // Record via sessionManager's recordExchange
      const { recordExchange } = await import('../utils/sessionManager.js');
      return await recordExchange(intent, promptLength, wordCount);
    }

    case 'REFLECTION_SAVED': {
      const { recordReflection } = await import('../utils/sessionManager.js');
      return await recordReflection(message.text);
    }

    case 'GET_CURRENT_SESSION':
      return getCurrentSession();

    case 'GET_ALL_SESSIONS':
      return await getSessions();

    case 'GET_SESSION':
      return await getSession(message.sessionId);

    case 'RESTORE_SESSION':
      return await restoreSession(message.sessionId);

    case 'CLEAR_ALL_DATA':
      await clearAllSessions();
      return { success: true };

    case 'GET_STORAGE_STATS':
      return await getStorageStats();

    case 'PING':
      return { pong: true, timestamp: new Date().toISOString() };

    default:
      return { error: 'Unknown message type' };
  }
}

// ── Tab Lifecycle ─────────────────────────────────────────────

// Start session when user navigates to a supported site
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (isSupportedSite(tab.url)) {
      const current = getCurrentSession();
      if (!current || current.site !== normalizeSite(tab.url)) {
        startSession(tab.url);
      }
    }
  } catch {
    // Ignore errors from restricted pages
  }
});

// Handle URL changes within same tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && isSupportedSite(changeInfo.url)) {
    startSession(changeInfo.url);
  }
});

// ── Helpers ──────────────────────────────────────────────────

function isSupportedSite(url) {
  if (!url) return false;
  return /^https:\/\/(chatgpt\.com|claude\.ai|gemini\.google\.com)/.test(url);
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