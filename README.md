# pi-0g

A [pi](https://pi.dev) provider for [0G](https://pc.0g.ai): every chat model 0G's router serves,
sent as OpenAI chat completions to `https://router-api.0g.ai/v1`.

## Install

```sh
pi install npm:pi-0g-provider   # or: pi install git:github.com/jake11-oho/pi-0g
export OG_API_KEY=sk-...        # an API key from https://pc.0g.ai
pi --model 0g/glm-5.3-flash
```

`pi --list-models 0g` lists the models.

## What it does

- **Models** come from 0G's public catalog (`GET /v1/models`, no key needed) at startup, so new
  models appear without updating this package. Context window, output limit, image input and
  prices are the catalog's. If the catalog cannot be reached, the last one fetched is used
  (cached in pi's agent directory, `cache/0g-models.json`).
- **Thinking levels** follow what 0G measured for each model (the catalog's `reasoning` field):
  - `off` sends `reasoning_effort: "none"` only for models where that was measured to turn
    thinking off. Elsewhere `off` sends nothing, and the model thinks as it does by default.
  - When some levels were measured to change how much the model thinks, only those are offered.
  - Models not measured yet keep pi's defaults (`off` through `high`, sent as
    `reasoning_effort`).
- Requests carry `X-Title: Pi` and `HTTP-Referer: https://pi.dev`.

`OG_BASE_URL` points it at another 0G router, e.g. staging
(`https://router-api-staging.0g.ai/v1`).

## Develop

```sh
bun test ./models.test.ts      # catalog mapping
pi -e ./index.ts --list-models 0g
```
