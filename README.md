# What Polymarket's trader leaderboards actually show

Compare the fifty busiest wallets with the fifty biggest earners using the [Predictefy Prediction Market API](https://predictefy.com/en/api?utm_source=github&utm_medium=repo&utm_campaign=trader-analysis&utm_content=readme). Inspect how the time window, selection rule and remaining positions change the apparent result.

This is a read-only local study. It never connects a wallet or places an order.

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
Copy-Item .env.example .env
# Put your Predictefy API key in .env, never in source code.
node src/study.mjs --quick    # eight current leaderboard reads, 8 credits; prints without saving
node src/study.mjs           # a larger fresh collection, including positions and sampled trades
node src/study.mjs --report  # rebuild results from your saved data, no calls or key needed
node src/server.mjs          # http://127.0.0.1:8819; local files only
npm test
```

A fresh study will differ from the archived video. `--resume` reuses saved feed and marks but refreshes other datasets, so their timestamps can differ. Do not describe such a run as one simultaneous snapshot. Never mix that refreshed collection with an old video without updating its claims.

Default settings: 15 feed pages per label, at most 2,500 market lookups, 10 earner books plus selected losses, up to four position pages each. Read the source flags before collecting a larger sample. Position pages cost 3 credits each; feed and market-tape reads cost credits too. Feature availability depends on plan. See [credits](https://docs.predictefy.com/guides/credits/) and [pricing](https://predictefy.com/en/pricing).

## Method

- `src/engine.mjs`: pure calculations; tests use synthetic fixtures.
- `src/study.mjs`: collector and saved-report generation.
- `src/server.mjs`: localhost-only results page.
- `data/`: ignored responses, coverage flags and timestamps; never commit keys.

The scored-buy view is an incomplete entry-to-terminal-price proxy. It does not know whether a wallet sold earlier, does not confirm resolution and leaves out fees. It must not be presented as actual realised wallet performance.

## Learn more

- [Trader intelligence documentation](https://docs.predictefy.com/reference/trader-intelligence/)
- [Predictefy quickstart](https://docs.predictefy.com/quickstart/)
- [How to use an LLM to analyse prediction markets](https://blog.predictefy.com/how-to-use-an-llm-to-analyze-prediction-markets)
- [Predictefy API](https://predictefy.com/en/api?utm_source=github&utm_medium=repo&utm_campaign=trader-analysis&utm_content=resources)

## License

MIT. Educational research, not financial advice.
