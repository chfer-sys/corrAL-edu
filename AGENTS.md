# AGENTS.md — corrAL-edu

## Project Overview

corrAL-edu is a Chrome Extension that captures student-AI interaction process data (not content) for formative assessment aligned with Singapore's PAIR framework.

**Key difference from corrAL:** No content scanning, no external AI calls, local-only storage. We observe process, not content.

## Tech Stack

| Component | Tech |
|-----------|------|
| Chrome Extension | Manifest V3, vanilla JS (ES6+), no build toolchain |
| Backend API | FastAPI, Python 3.11+ |
| Dashboard | Vanilla HTML + JS (single file, no framework) |
| Database | SQLite (local, per-school) |
| Intent Classification | Local regex (no external AI) |

## Project Structure

```
corrAL-edu/
├── extension/              # Chrome Extension (Tier 1)
│   ├── manifest.json           # Manifest V3
│   ├── content/                # Injected into AI chat sites
│   │   ├── injector.js         # Captures prompts, logs events
│   │   └── intentClassifier.js # Local regex classifier
│   ├── background/            # Service worker
│   │   └── serviceWorker.js   # Handles messaging, stores data
│   ├── popup/                 # Extension popup UI
│   │   └── popup.html/js      # Shows session status
│   ├── dashboard/             # Teacher config panel
│   │   └── index.html/js      # Dashboard UI
│   ├── utils/
│   │   ├── storage.js         # Chrome Storage API wrapper
│   │   └── sessionManager.js  # Session lifecycle
│   └── icons/                 # Extension icons
├── backend/                  # FastAPI — API Gateway (Tier 2)
│   ├── app/
│   │   └── main.py            # All endpoints
│   └── requirements.txt
├── tests/
│   ├── extension/             # Extension unit tests
│   ├── backend/               # API tests
│   └── integration/           # Full flow tests
└── AGENTS.md                  # This file
```

## Development Environment Setup

```bash
# Clone the repo
git clone https://github.com/fireworks-hq/corrAL-edu.git
cd corrAL-edu

# Backend setup
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main  # starts on port 8000

# Testing
cd ..
pytest tests/ -v
```

## Coding Conventions

### Chrome Extension (vanilla JS, ES6+)

**DO:**
- Use `const` / `let` — never `var`
- Keep content scripts isolated — no DOM manipulation outside injection targets
- Use Chrome Runtime Message Passing for content ↔ background communication
- Add `type: "module"` in manifest for ES6 imports

**DON'T:**
- No build toolchain (no webpack, no vite, no babel)
- No inline event handlers — use `addEventListener`
- No eval() or innerHTML with user data
- Don't log actual prompt/response content — only metrics

### Python (FastAPI)

- Follow PEP 8
- Type hints on all function signatures
- Pydantic models for all API schemas
- Async endpoints where possible

### Intent Classification (Local Regex)

**Patterns to detect:**
```javascript
const INTENT_PATTERNS = {
  debugging: /\b(error|bug|fix|doesn't work|exception|traceback|issue|problem|wrong|broken|fail)\b/i,
  brainstorming: /\b(idea|think about|explore|possibilities|options|approach|different ways|ways to|could we|what if|how about)\b/i,
  explaining: /\b(understand|what is|how does|explain|clarify|definition|tell me about|describe|meaning|concept)\b/i,
  summarizing: /\b(summarize|tl;dr|recap|wrap up|key points|bottom line|summary|in short|overall)\b/i,
};
```

**Rule:** If none match → `other`. If multiple match → use the first match in order (debugging → brainstorming → explaining → summarizing → other).

## Extension Injection Targets

Content script should be injected into:
- `https://chatgpt.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`

**Injection approach:** Declarative net request with documentIdle for load timing.

**For each site, detect:**
- Input field selectors (textareas, contenteditable)
- Submit button (Enter key or button click)

## Data Stored Per Session (NOT actual content)

```javascript
// What we store (Chrome Storage API)
const sessionRecord = {
  sessionId: "uuid-v4",
  startTime: "ISO-8601",
  endTime: "ISO-8601" | null,
  site: "chatgpt.com" | "claude.ai" | "gemini.google.com",
  exchangeCount: 0,  // increments each prompt sent
  exchanges: [
    {
      index: 0,
      timestamp: "ISO-8601",
      intent: "debugging" | "brainstorming" | "explaining" | "summarizing" | "other",
      promptLength: 150,  // chars only, NOT the text
      wordCount: 30,      // words only, NOT the text
      hasReflection: false
    }
  ],
  reflectionText: "I learned that..." | null  // only if student typed something
};
```

**Critical:** `promptLength` and `wordCount` are numbers (character/word counts), NOT the actual text. We never store what the student asked or what the AI responded.

## API Endpoints (FastAPI)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| GET | `/sessions` | List all sessions (paginated, filter by days) |
| GET | `/sessions/{id}` | Get session detail |
| GET | `/sessions/{id}/metrics` | Get process metrics only |
| POST | `/sessions` | Create or update a session |
| POST | `/exchanges` | Add exchange to a session |
| POST | `/sessions/{id}/reflection` | Save reflection text |
| GET | `/stats/overview` | Aggregate stats (14/30/90 day windows) |
| GET | `/export/csv` | Export all sessions as CSV |

## Privacy & Security Rules

1. **NEVER log actual prompt or response text** — only metadata (length, intent, timestamp)
2. **No external API calls** — no AI processing, no cloud sync
3. **All data on-device** — school owns their data
4. **No student identifiers** unless teacher explicitly tags sessions (default: anonymous)

## Agent Behaviour Guidelines

- Read SPEC.md and PRD.md before writing any code
- Follow existing extension patterns (corrAL)
- Do not over-engineer — MVP is local-only, no cloud, regex-based intent
- When adding a new intent category, update the regex map AND add test cases
- No features beyond what's in PRD — if it feels like scope creep, note it and defer

## Common Issues / Gotchas

1. **Manifest V3 service worker** — can't use certain Chrome APIs in service worker context. Test on actual Chrome, not just Node.
2. **Content script injection timing** — AI chat sites are SPA; use `document_idle` or observe DOM mutations.
3. **Chrome Storage API limits** — 10MB limit. Sessions should be pruned after 90 days. Track storage usage.
4. **Intent classification edge cases** — "debug" is a method name in code, might trigger false positive in programming contexts. Use surrounding context if possible.
5. **CORS** — backend needs CORSM middleware for local dev (dashboard is served from `file://` or `chrome-extension://`).