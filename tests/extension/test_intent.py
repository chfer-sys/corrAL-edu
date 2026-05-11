"""
Unit tests for intent classifier.
Run with: python -m pytest tests/extension/test_intent.py -v
"""

import re

def classifyIntent(promptText):
    # Order matters: first match wins. Summarizing before brainstorming to avoid "tl;dr" false match.
    INTENT_PATTERNS = [
        ("debugging", re.compile(r"(\berror\b|\bbug\b|\bfix\b|doesn't work|exception|\btraceback\b|\bissue\b|\bproblem\b|\bwrong\b|\bbroken\b|\bfail\b|typeerror|undefined|null is not|\bundefined\b)", re.I)),
        ("explaining", re.compile(r"(\bunderstand\b|\bwhat is\b|\bhow does\b|\bexplain\b|\bclarify\b|\bdefinition\b|\btell me about\b|\bdescribe\b|\bmeaning\b|\bconcept\b)", re.I)),
        ("brainstorming", re.compile(r"(\bidea\b|\bthink about\b|\bexplore\b|\bpossibilities\b|\boptions\b|\bapproach\b|\bdifferent ways\b|\bways to\b|\bcould we\b|\bwhat if\b|\bhow about\b)", re.I)),
        ("summarizing", re.compile(r"(summarize|tl;?dr|recap|wrap up|key points|bottom line|summary|in short|overall)", re.I)),
    ]
    for intent, pattern in INTENT_PATTERNS:
        if pattern.search(promptText):
            return intent
    return "other"

# Test cases
tests = [
    # debugging
    ("I keep getting a TypeError when I run my code", "debugging"),
    ("Why does my function return undefined?", "debugging"),
    ("There's a bug in my sorting algorithm", "debugging"),

    # brainstorming
    ("What are different ways to optimize this query?", "brainstorming"),
    ("I have an idea for refactoring the auth module", "brainstorming"),
    ("Could we try using a different data structure here?", "brainstorming"),

    # explaining
    ("Can you explain how Python's list comprehension works?", "explaining"),
    ("What is the difference between async and await?", "explaining"),
    ("Tell me about how closures work in JavaScript", "explaining"),

    # summarizing
    ("Summarize the key points of this article", "summarizing"),
    ("tl;dr: what's the main idea?", "summarizing"),
    ("In short, what did we decide?", "summarizing"),

    # other (edge cases)
    ("Write a function to calculate fibonacci", "other"),
    ("Help me format this date in JavaScript", "other"),
    ("Generate a report of sales data", "other"),
]

passed = 0
failed = []
for text, expected in tests:
    result = classifyIntent(text)
    status = "PASS" if result == expected else "FAIL"
    print(f"[{status}] '{text[:50]}' -> {result} (expected {expected})")
    if result == expected:
        passed += 1
    else:
        failed.append((text, expected, result))

print(f"\n{passed}/{len(tests)} tests passed")
if failed:
    print(f"FAILED: {failed}")