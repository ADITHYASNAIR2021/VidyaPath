# VidyaPath Performance Plan (April 2026)

## Implemented now

1. Added client-side auth/session response caching with in-flight request de-duplication.
2. Reduced duplicate session fetches in global shell/navigation and key learning pages.
3. Added deferred search input rendering on heavy filter pages (`/chapters`, `/formulas`, `/equations`) to keep typing smooth.
4. Kept static/SSG output stable for chapter/formula/equation surfaces through existing build pipeline and route integrity checks.

## Next phase

1. Add server-side cache headers for read-heavy JSON APIs (where safe by role/school context).
2. Introduce per-route data prefetch strategy for mobile navigation targets.
3. Add lightweight client telemetry for:
   - TTFB by API route
   - FCP/LCP for chapters/formulas/equations
   - Search interaction latency
4. Virtualize long card lists on mobile once list size exceeds threshold.
5. Add periodic performance CI checks (bundle-size budgets + Lighthouse mobile smoke).
