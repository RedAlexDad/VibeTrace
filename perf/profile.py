#!/usr/bin/env python3
"""
Capture a Chrome performance trace (via CDP Tracing) and summarize where CPU goes.

Usage:
    python3 perf/profile.py [--url <page-url>] [--out /tmp/opencode/trace.json]

Prints a per-category CPU breakdown (Scripting / Layout / Paint / Parse / Other)
plus the top trace categories. Use this to judge whether a bottleneck is
computation (WASM/Rust could help) vs rendering (it can't).
"""
import asyncio
import json
import sys
from collections import defaultdict
from playwright.async_api import async_playwright

DEFAULT_URL = (
    "http://localhost:5173/?dir=%2Fhome%2Fredalexdad%2FGitHub%2FVibeTrace"
    "&session=ses_fe41e5d33ffeeQhQsvtOMcOO4E"
)
DEFAULT_TRACE = "/tmp/opencode/trace.json"


def parse_args(argv):
    url = DEFAULT_URL
    out = DEFAULT_TRACE
    i = 0
    while i < len(argv):
        if argv[i] == "--url" and i + 1 < len(argv):
            url = argv[i + 1]
            i += 2
        elif argv[i] == "--out" and i + 1 < len(argv):
            out = argv[i + 1]
            i += 2
        else:
            i += 1
    return url, out


async def capture(url: str, trace_path: str):
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()
        session = await context.new_cdp_session(page)

        # Standard Chrome tracing: produces ph:'X' complete events we can bucket.
        collected = []
        session.on("Tracing.dataCollected", lambda e: collected.append(e.get("value", [])))

        await session.send(
            "Tracing.start",
            {
                "categories": "-*,devtools.timeline,disabled-by-default-devtools.timeline,"
                "disabled-by-default-devtools.timeline.frame,blink.user_timing,"
                "v8.execute,blink.console",
                "transferMode": "ReportEvents",
            },
        )
        try:
            await page.goto(url, wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)

            show = page.get_by_role("button", name="Show VibeTrace panel")
            try:
                if await show.count() > 0:
                    await show.click(timeout=2000)
            except Exception:
                pass
            await page.wait_for_timeout(2500)

            # Burst of interaction to capture rebuild cost.
            try:
                toggle = page.get_by_role("button", name="summary", exact=True)
                if await toggle.count() > 0:
                    await toggle.click(timeout=2000)
                    await page.wait_for_timeout(700)
                    await page.get_by_role("button", name="timeline", exact=True).click(timeout=2000)
                    await page.wait_for_timeout(700)
            except Exception:
                pass
            await page.wait_for_timeout(1000)
        finally:
            try:
                await session.send("Tracing.end")
            except Exception:
                pass
        # dataCollected events flush asynchronously after Tracing.end — give them time.
        await page.wait_for_timeout(2000)

        raw = json.dumps({"traceEvents": [e for chunk in collected for e in chunk]})
        with open(trace_path, "w", encoding="utf-8") as f:
            f.write(raw)
        await browser.close()


def load_trace(path: str) -> list:
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read()
    try:
        doc = json.loads(text)
    except json.JSONDecodeError:
        events = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return events
    if isinstance(doc, dict) and "traceEvents" in doc:
        return doc.get("traceEvents", [])
    return doc if isinstance(doc, list) else [doc]


def bucket(cat: str) -> str:
    c = cat.lower()
    if any(k in c for k in ("v8", "javascript", "functioncall", "evaluate", "compile", "jssource")):
        return "Scripting (JS)"
    if any(k in c for k in ("layout", "reflow")):
        return "Layout"
    if any(k in c for k in ("paint", "raster", "draw", "composite", "layerize", "cc::")):
        return "Paint/Composite"
    if any(k in c for k in ("parsehtml", "parsecss", "parse", "resource", "network")):
        return "Parse/Network"
    return "Other"


async def main(argv):
    url, out = parse_args(argv)
    await capture(url, out)
    data = load_trace(out)

    phases = defaultdict(float)
    count = defaultdict(int)
    events = data
    for e in events:
        if e.get("ph") == "X" and "dur" in e:
            dur = e["dur"] / 1000.0  # us -> ms
            name = str(e.get("name", ""))
            phases[name] += dur
            count[name] += 1

    top = sorted(phases.items(), key=lambda kv: kv[1], reverse=True)
    total = sum(phases.values()) or 1.0

    print("=== CPU time by trace event (top) ===")
    for name, ms in top[:25]:
        pct = ms / total * 100
        print(f"  {name:48s} {ms:10.1f} ms  {pct:5.1f}%  ({count[name]} events)")

    def bucket(name: str) -> str:
        n = name.lower()
        if any(k in n for k in ("v8", "functioncall", "evaluate", "compile", "jssource", "parse-script")):
            return "Scripting (JS)"
        if any(k in n for k in ("layout", "reflow")):
            return "Layout"
        if any(k in n for k in ("paint", "raster", "draw", "composite", "layerize", "updatelayer", "record")):
            return "Paint/Composite"
        if any(k in n for k in ("parsehtml", "parsecss", "resource", "network", "navigation")):
            return "Parse/Network"
        return "Other"

    buckets = defaultdict(float)
    for name, ms in phases.items():
        buckets[bucket(name)] += ms

    print("\n=== Human-readable breakdown (by event name) ===")
    for name, ms in sorted(buckets.items(), key=lambda kv: kv[1], reverse=True):
        print(f"  {name:20s} {ms:10.1f} ms  {ms / total * 100:5.1f}%")

    print(f"\nTotal sampled: {total:.0f} ms across {len(events)} trace events.")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
