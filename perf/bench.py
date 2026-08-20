#!/usr/bin/env python3
"""
Benchmark VibeTrace UI render cost + long tasks.

Usage:
    python3 perf/bench.py [--url <page-url>]

Measures:
  - number of mounted subtask cards / SVGs / action groups / DOM nodes
  - CPU spent in long tasks while switching timeline<->summary (full SVG rebuild)
  - CPU spent in long tasks while scrolling the message list
  - total long-task CPU across the session

Requires the dev server + opencode serve running (see Makefile).
"""
import asyncio
import json
import sys
from playwright.async_api import async_playwright

DEFAULT_URL = (
    "http://localhost:5173/?dir=%2Fhome%2Fredalexdad%2FGitHub%2FVibeTrace"
    "&session=ses_fe41e5d33ffeeQhQsvtOMcOO4E"
)


def parse_args(argv):
    url = DEFAULT_URL
    i = 0
    while i < len(argv):
        if argv[i] == "--url" and i + 1 < len(argv):
            url = argv[i + 1]
            i += 2
        else:
            i += 1
    return url


async def main(argv):
    url = parse_args(argv)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        counters = {"consoleErrors": 0}
        page.on(
            "console",
            lambda m: counters.update(consoleErrors=counters["consoleErrors"] + 1)
            if m.type == "error"
            else None,
        )

        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)

        show_btn = page.get_by_role("button", name="Show VibeTrace panel")
        try:
            if await show_btn.count() > 0:
                await show_btn.click(timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(3000)

        await page.evaluate(
            """() => {
                window.__longTasks = [];
                new PerformanceObserver((list) => {
                    for (const e of list.getEntries())
                        window.__longTasks.push({dur: Math.round(e.duration), start: Math.round(e.startTime)});
                }).observe({type: 'longtask', buffered: true});
            }"""
        )

        def long_cpu_after(t0):
            return page.evaluate(
                """([t0]) => {
                    return (window.__longTasks ?? []).filter(l => l.start >= t0).reduce((a,l)=>a+l.dur,0);
                }""",
                [t0],
            )

        # Full re-render of every card SVG (timeline<->summary) — keeps session stable.
        await page.evaluate("window.__t2 = performance.now()")
        try:
            toggle = page.get_by_role("button", name="summary", exact=True)
            if await toggle.count() > 0:
                await toggle.click(timeout=2000)
                await page.wait_for_timeout(800)
                await page.get_by_role("button", name="timeline", exact=True).click(timeout=2000)
                await page.wait_for_timeout(800)
        except Exception:
            pass
        cpu_rebuild = await long_cpu_after(await page.evaluate("() => window.__t2"))

        # Scroll the message list.
        await page.evaluate("window.__t1 = performance.now()")
        await page.evaluate(
            """() => {
                const el = document.querySelector('[data-message-index]')?.closest('div[style*="overflowY"]');
                if (el) for (let y = 0; y < 4000; y += 500) el.scrollTop = y;
            }"""
        )
        await page.wait_for_timeout(150)
        cpu_scroll = await long_cpu_after(await page.evaluate("() => window.__t1"))

        c = await page.evaluate(
            """() => ({
                cards: document.querySelectorAll('[data-subtask-card-index]').length,
                svgs: document.querySelectorAll('svg').length,
                afv: document.querySelectorAll('g.afv-action').length,
                domNodes: document.getElementsByTagName('*').length,
                longTotal: (window.__longTasks ?? []).reduce((a,l)=>a+l.dur,0),
            })"""
        )

        counters.update(c)
        await browser.close()

        out = {"cpuRebuildMs": cpu_rebuild, "cpuScrollMs": cpu_scroll, **counters}
        print(json.dumps(out, indent=2))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
