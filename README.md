# Polymarket Trader Analysis with the Predictefy API

Compare the fifty busiest wallets with the fifty biggest earners using the [Predictefy Prediction Market API](https://predictefy.com/en/api?utm_source=github&utm_medium=repo&utm_campaign=trader-analysis&utm_content=readme). Inspect how the time window, selection rule and remaining positions change the apparent result.

This is a read-only local study. It never connects a wallet or places an order.

It calls the REST API directly with Node.js's built-in `fetch`; no SDK is required. For alternative clients, see the official [Predictefy TypeScript SDK](https://docs.predictefy.com/guides/sdk/) and [Python SDK](https://docs.predictefy.com/guides/python-sdk/).

[![Tests](https://github.com/Ong-pogs/polymarket-trader-analysis/actions/workflows/test.yml/badge.svg)](https://github.com/Ong-pogs/polymarket-trader-analysis/actions/workflows/test.yml)

## The recorded snapshot

The video uses responses saved on October 8, 2026, not a current leaderboard. The endpoint's `month` window is retained; it is not labelled a full calendar month.

| Selection | Wallets | Reported combined profit | Negative rows |
|---|---:|---:|---:|
| Highest monthly volume | 50 | -$106,962,727 | 32 |
| Highest monthly profit | 50 | +$36,748,015 | 0 |

Ten wallets appeared on both lists. These are selected groups, not a platform-wide census. Wallets are not people, volume is not capital, and reported leaderboard profit is not independently reconciled by this tool.

All ten sampled monthly top earners had a negative sum on their remaining positions page. Redeemed winners can leave while losing tickets remain. That positions sum is not a lifetime profit statement; some collections stop at 400 rows and retain a partial flag.

The collector was interrupted during a separate scored-trade collection. Those incomplete last-price proxies are excluded from the video's conclusions. A price near $1 or $0 is not proof of official settlement. No complete usage total was saved; this project does not invent one.

## Run locally

Node.js 22.12 or newer; no npm dependencies.

```powershell
git clone https://github.com/Ong-pogs/polymarket-trader-analysis
cd polymarket-trader-analysis
Copy-Item .env.example .env
# Put your Predictefy API key in .env, never in source code.
node src/study.mjs --quick    # eight current leaderboard reads, 8 credits; prints without saving
node src/study.mjs           # a larger fresh collection, including positions and sampled trades
node src/study.mjs --report  # rebuild results from your saved data, no calls or key needed
node src/server.mjs          # http://127.0.0.1:8819; local files only
npm test
```

A fresh study will differ from the archived video. `--resume` reuses saved feed and marks but refreshes other datasets, so their timestamps can differ. Do not describe such a run as one simultaneous snapshot. Never mix that refreshed collection with an old video without updating its claims.

The repository includes source, synthetic tests, a screenshot and the [build prompt](build-prompt.txt). It does not bundle the archived API responses, local keys or generated results. `--quick` prints current boards without saving them; `--report` and the dashboard need data saved by a collection first. A full collection also requests positions and sampled trades, so check its scope and costs before starting it.

Default settings: 15 feed pages per label, at most 2,500 market lookups, 10 earner books plus selected losses, up to four position pages each. Read the source flags before collecting a larger sample. Position pages cost 3 credits each; feed and market-tape reads cost credits too. Feature availability depends on plan. See [credits](https://docs.predictefy.com/guides/credits/) and [pricing](https://predictefy.com/en/pricing).

## Method

- `src/engine.mjs`: pure calculations; tests use synthetic fixtures.
- `src/study.mjs`: collector and saved-report generation.
- `src/server.mjs`: localhost-only results page.
- `data/`: ignored responses, coverage flags and timestamps; never commit keys.

The scored-buy view is an incomplete entry-to-terminal-price proxy. It does not know whether a wallet sold earlier, does not confirm resolution and leaves out fees. It must not be presented as actual realised wallet performance.

## Tests and build prompt

Run `npm test` to execute the 19 analysis tests without an API key or network calls. GitHub Actions runs them on Windows, macOS and Linux. The [build prompt](build-prompt.txt) documents the collector, calculations and dashboard; it is also available as a standalone specification for rebuilding the project.

## Predictefy API and SDK resources

- [Trader intelligence documentation](https://docs.predictefy.com/reference/trader-intelligence/)
- [Predictefy quickstart](https://docs.predictefy.com/quickstart/)
- [Predictefy API reference](https://docs.predictefy.com/api/)
- [Get an API key](https://portal.predictefy.com/keys)
- [API-key guide](https://docs.predictefy.com/guides/api-keys/)
- [TypeScript SDK](https://docs.predictefy.com/guides/sdk/) and [Python SDK](https://docs.predictefy.com/guides/python-sdk/) for applications using an official client instead of direct REST
- [Venue coverage](https://docs.predictefy.com/reference/venues/): trader-intelligence support varies by venue
- [Credits and feature access](https://docs.predictefy.com/guides/credits/) and [pricing](https://predictefy.com/en/pricing)
- [Rate limits and retries](https://docs.predictefy.com/guides/rate-limits/)
- [API errors](https://docs.predictefy.com/guides/errors/)
- [API best practices](https://docs.predictefy.com/guides/best-practices/)
- [How to use an LLM to analyse prediction markets](https://blog.predictefy.com/how-to-use-an-llm-to-analyze-prediction-markets)
- [Predictefy API](https://predictefy.com/en/api?utm_source=github&utm_medium=repo&utm_campaign=trader-analysis&utm_content=resources)

API questions: [Predictefy Discord](https://discord.gg/KVrWkhD8S).

## License

MIT. Educational research, not financial advice.
