"""
corrAL-edu Backend — FastAPI
Local-only API for session metrics storage and export.
No external AI calls, no cloud sync.
"""

import sqlite3
from datetime import datetime, timedelta
from typing import Optional
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import pydantic

app = FastAPI(title="corrAL-edu API", version="1.0.0")

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "corral_edu.db"

# ── Database Setup ──────────────────────────────────────────

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                start_time TEXT NOT NULL,
                end_time TEXT,
                site TEXT NOT NULL,
                exchange_count INTEGER DEFAULT 0,
                reflection_text TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS exchanges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                exchange_index INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                intent TEXT NOT NULL,
                prompt_length INTEGER NOT NULL,
                word_count INTEGER NOT NULL,
                has_reflection INTEGER DEFAULT 0,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
        """)
        conn.commit()

init_db()

# ── Pydantic Models ──────────────────────────────────────────

class ExchangeIn(pydantic.BaseModel):
    session_id: str
    exchange_index: int
    timestamp: str
    intent: str
    prompt_length: int
    word_count: int
    has_reflection: bool = False

class SessionIn(pydantic.BaseModel):
    id: str
    start_time: str
    end_time: Optional[str] = None
    site: str
    exchange_count: int = 0
    reflection_text: Optional[str] = None

# ── Endpoints ────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok", "service": "corrAL-edu", "version": "1.0.0"}

@app.get("/sessions")
async def list_sessions(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    days: Optional[int] = Query(default=14, ge=1, le=90)
):
    """List recent sessions, optionally filtered by days."""
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    with get_db() as conn:
        rows = conn.execute(
            """SELECT s.*, COUNT(e.id) as exchange_count
               FROM sessions s
               LEFT JOIN exchanges e ON e.session_id = s.id
               WHERE s.start_time >= ?
               GROUP BY s.id
               ORDER BY s.start_time DESC
               LIMIT ? OFFSET ?""",
            (cutoff, limit, offset)
        ).fetchall()
    return [dict(r) for r in rows]

@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session detail with all exchanges."""
    with get_db() as conn:
        session = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        exchanges = conn.execute(
            "SELECT * FROM exchanges WHERE session_id = ? ORDER BY exchange_index",
            (session_id,)
        ).fetchall()
    return {
        **dict(session),
        "exchanges": [dict(e) for e in exchanges]
    }

@app.get("/sessions/{session_id}/metrics")
async def get_session_metrics(session_id: str):
    """Get process metrics only (no content)."""
    with get_db() as conn:
        session = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        exchanges = conn.execute(
            "SELECT intent, COUNT(*) as count FROM exchanges WHERE session_id = ? GROUP BY intent",
            (session_id,)
        ).fetchall()
    total_exchanges = sum(e['count'] for e in exchanges)
    intent_breakdown = {e['intent']: e['count'] for e in exchanges}
    return {
        "session_id": session_id,
        "site": session['site'],
        "total_exchanges": total_exchanges,
        "intent_breakdown": intent_breakdown,
        "has_reflection": bool(session['reflection_text']),
        "reflection_rate": 1 if session['reflection_text'] else 0,
    }

@app.post("/sessions")
async def create_or_update_session(session: SessionIn):
    """Create or update a session."""
    with get_db() as conn:
        conn.execute("""
            INSERT INTO sessions (id, start_time, end_time, site, exchange_count, reflection_text)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                end_time = excluded.end_time,
                exchange_count = excluded.exchange_count,
                reflection_text = excluded.reflection_text
        """, (session.id, session.start_time, session.end_time, session.site,
              session.exchange_count, session.reflection_text))
        conn.commit()
    return {"success": True}

@app.post("/exchanges")
async def add_exchange(exchange: ExchangeIn):
    """Add an exchange to a session."""
    with get_db() as conn:
        conn.execute("""
            INSERT INTO exchanges (session_id, exchange_index, timestamp, intent, prompt_length, word_count, has_reflection)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (exchange.session_id, exchange.exchange_index, exchange.timestamp,
              exchange.intent, exchange.prompt_length, exchange.word_count,
              1 if exchange.has_reflection else 0))
        conn.commit()
    return {"success": True}

@app.post("/sessions/{session_id}/reflection")
async def save_reflection(session_id: str, reflection: dict):
    """Save reflection text for a session."""
    text = reflection.get('text', '')
    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET reflection_text = ? WHERE id = ?",
            (text, session_id)
        )
        conn.commit()
    return {"success": True}

@app.get("/export/csv")
async def export_csv():
    """Export all session metrics as CSV."""
    with get_db() as conn:
        sessions = conn.execute(
            "SELECT s.*, COUNT(e.id) as exchange_count FROM sessions s LEFT JOIN exchanges e ON e.session_id = s.id GROUP BY s.id"
        ).fetchall()
        exchanges = conn.execute(
            "SELECT session_id, intent FROM exchanges"
        ).fetchall()

    # Build intent map
    intent_map = {}
    for e in exchanges:
        sid = e['session_id']
        if sid not in intent_map:
            intent_map[sid] = []
        intent_map[sid].append(e['intent'])

    lines = ["Session ID,Start Time,End Time,Site,Exchanges,Intents,Has Reflection"]
    for s in sessions:
        intents = ';'.join(intent_map.get(s['id'], []))
        has_refl = 'Yes' if s['reflection_text'] else 'No'
        lines.append(f"{s['id']},{s['start_time']},{s['end_time'] or ''},{s['site']},{s['exchange_count'] or 0},\"{intents}\",{has_refl}")

    csv = '\n'.join(lines)
    return StreamingResponse(
        iter([csv]),
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename="corral-edu-export.csv"'}
    )

@app.get("/stats/overview")
async def get_overview_stats(days: int = Query(default=14, ge=1, le=90)):
    """Aggregate stats across all sessions."""
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    with get_db() as conn:
        total = conn.execute(
            "SELECT COUNT(*) as c FROM sessions WHERE start_time >= ?", (cutoff,)
        ).fetchone()['c']
        total_ex = conn.execute(
            "SELECT COUNT(*) as c FROM exchanges e JOIN sessions s ON e.session_id = s.id WHERE s.start_time >= ?", (cutoff,)
        ).fetchone()['c']
        with_refl = conn.execute(
            "SELECT COUNT(*) as c FROM sessions WHERE start_time >= ? AND reflection_text IS NOT NULL AND reflection_text != ''", (cutoff,)
        ).fetchone()['c']
        intent_rows = conn.execute(
            """SELECT e.intent, COUNT(*) as count
               FROM exchanges e JOIN sessions s ON e.session_id = s.id
               WHERE s.start_time >= ?
               GROUP BY e.intent""", (cutoff,)
        ).fetchall()

    avg_ex = total and round(total_ex / total, 1) or 0
    refl_rate = total and round((with_refl / total) * 100, 1) or 0

    return {
        "total_sessions": total,
        "total_exchanges": total_ex,
        "avg_exchanges_per_session": avg_ex,
        "reflection_rate": refl_rate,
        "intent_distribution": {r['intent']: r['count'] for r in intent_rows},
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)