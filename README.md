# Demografix TypeScript SDK

Predict gender, age, and nationality from names. One client covers all three Demografix APIs —
[genderize.io](https://genderize.io) (gender), [agify.io](https://agify.io) (age), and
[nationalize.io](https://nationalize.io) (nationality) — with single-name lookups and batches of up
to 100 names per request.

[![npm](https://img.shields.io/npm/v/demografix)](https://www.npmjs.com/package/demografix)
[![CI](https://github.com/DemografixGenderize/demografix-node/actions/workflows/ci.yml/badge.svg)](https://github.com/DemografixGenderize/demografix-node/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Install

```sh
npm install demografix
```

The SDK ships ESM, CommonJS, and type declarations. It uses the global `fetch` and has zero runtime
dependencies. It runs on Node 20 or later and in browsers with `fetch`. Browsers omit the
`User-Agent` header, which is a forbidden header name, so requests sent from a browser are not
tagged with the SDK user agent.

## Quickstart

Construct a client, run a batch over a list of names, read the predictions, and read the remaining quota.

```ts
import { Demografix } from "demografix";

const client = new Demografix(process.env.DEMOGRAFIX_API_KEY ?? "YOUR_API_KEY");

const names = ["michael", "matthew", "jane"];
const ages = await client.agifyBatch(names);

// Aggregate the list into an age distribution.
const distribution: Record<string, number> = {};
for (const r of ages.results) {
  if (r.age === null) continue;
  const decade = `${Math.floor(r.age / 10) * 10}s`;
  distribution[decade] = (distribution[decade] ?? 0) + 1;
}

console.log(distribution);          // { "40s": 1, "50s": 1, "20s": 1 }
console.log(ages.quota.remaining);  // 24987
```

## genderize

Predict gender from names. A single call returns the prediction fields plus a `quota`.

```ts
const g = await client.genderize("peter");
g.gender;           // "male" | "female" | null
g.probability;      // 1.0
g.count;            // 1352696
g.quota.remaining;  // 24987
```

The batch form returns the gender split of the list.

```ts
const batch = await client.genderizeBatch(["peter", "lois", "kim"]);
const split = { male: 0, female: 0, unknown: 0 };
for (const r of batch.results) {
  split[r.gender ?? "unknown"] += 1;
}
split;  // a count per category across the list
```

`gender` is `null` when no match is found, with `probability` `0` and `count` `0`. That is a
successful response, not an error.

## agify

Predict age from names.

```ts
const a = await client.agify("michael");
a.age;    // 57 | null
a.count;  // 311558

const batch = await client.agifyBatch(["michael", "matthew"]);
const mean =
  batch.results.reduce((sum, r) => sum + (r.age ?? 0), 0) / batch.results.length;
```

## nationalize

Predict nationality from names. Each prediction carries up to five candidate countries in descending probability.

```ts
const n = await client.nationalize("nguyen");
n.country[0].countryId;     // "VN"
n.country[0].probability;   // 0.891132

const batch = await client.nationalizeBatch(["nguyen", "schmidt"]);
const mix: Record<string, number> = {};
for (const r of batch.results) {
  const top = r.country[0]?.countryId;
  if (top) mix[top] = (mix[top] ?? 0) + 1;
}
mix;  // the nationality mix of the list
```

## Batch limit

Each batch accepts at most 100 names. A batch of more than 100 throws `ValidationError` before any
HTTP call. Chunk a longer list and aggregate across the chunks.

```ts
const split: Record<string, number> = {};
for (let i = 0; i < roster.length; i += 100) {
  const batch = await client.genderizeBatch(roster.slice(i, i + 100));
  for (const r of batch.results) {
    const key = r.gender ?? "unknown";
    split[key] = (split[key] ?? 0) + 1;
  }
}
```

## country_id

`genderize` and `agify` accept an optional `countryId` (ISO 3166-1 alpha-2) to scope the prediction
to a country. The code is echoed back uppercase on every prediction. `nationalize` does not take a
country.

```ts
const batch = await client.agifyBatch(["andrea", "jean", "kim"], { countryId: "DE" });
batch.results[0]?.countryId;  // "DE", echoed uppercase on each prediction
```

Scoping changes the prediction: `andrea` reads female with probability 0.99 in the United States and
male with probability 0.79 in Italy.

```ts
(await client.genderize("andrea", { countryId: "US" })).gender;  // "female"
(await client.genderize("andrea", { countryId: "IT" })).gender;  // "male"
```

When the request sends no `countryId`, the field is `null`.

## Quota

Every result and every raised error carries a `quota` read from the response headers.

| Field | Meaning |
|---|---|
| `limit` | names allowed in the current window |
| `remaining` | names left in the current window |
| `reset` | seconds until the window resets |

Quota is read off a returned value or a caught error. The client does not cache it.

## Errors

Non-2xx responses throw a typed error. Every error extends `DemografixError`, which extends `Error`,
and carries `status`, `message`, and `quota`.

| Class | Cause |
|---|---|
| `AuthError` | 401, missing or invalid API key |
| `SubscriptionError` | 402, subscription expired or inactive |
| `ValidationError` | 422, and client-side when a batch exceeds 100 names |
| `RateLimitError` | 429, request limit reached; `quota` always populated |
| `TransportError` | network failure, timeout, or non-JSON body |
| `DemografixError` | base type, and any other non-2xx status |

On a `RateLimitError`, `quota.reset` reports the seconds until the window resets. Wait that long
before retrying.

```ts
import { RateLimitError } from "demografix";

try {
  await client.agifyBatch(names);
} catch (err) {
  if (err instanceof RateLimitError) {
    await new Promise((r) => setTimeout(r, err.quota!.reset * 1000));
    // retry after the window resets
  } else {
    throw err;
  }
}
```

## Methods

| Method | Returns | country_id |
|---|---|---|
| `genderize(name, options?)` | `GenderizeResult` | yes |
| `genderizeBatch(names, options?)` | `Batch<GenderizePrediction>` | yes |
| `agify(name, options?)` | `AgifyResult` | yes |
| `agifyBatch(names, options?)` | `Batch<AgifyPrediction>` | yes |
| `nationalize(name, options?)` | `NationalizeResult` | no |
| `nationalizeBatch(names, options?)` | `Batch<NationalizePrediction>` | no |

All methods are async and return a Promise. Every method's `options` takes an optional `signal`
(`AbortSignal`) for cancellation; genderize and agify also take `countryId`. The constructor takes
`new Demografix(apiKey, { timeout? })`; `apiKey` is required and `timeout` defaults to 10000
milliseconds. Base URLs and the User-Agent are fixed constants, not options.

## Cancellation

Every method accepts an optional `AbortSignal`, composed with the client's own timeout. The request
ends when either the signal aborts or the timeout elapses.

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 500);

const batch = await client.nationalizeBatch(names, { signal: controller.signal });
```

When the caller's signal aborts first, its abort reason propagates as-is, the way `fetch` raises it.
When the internal timeout elapses, the call throws a `TransportError`.

## API keys

An API key is required. Creating one is free and includes 2,500 names per month.

Quota counts **names, not requests**. A single-name call costs 1. A batch of 100 names costs 100. The
free tier therefore covers 2,500 names in a month however they are split across calls.

Generate a key in your dashboard at [genderize.io](https://genderize.io),
[agify.io](https://agify.io), or [nationalize.io](https://nationalize.io). One key works across all
three services. Full reference:
[genderize.io/documentation/api](https://genderize.io/documentation/api).

## License

MIT. See [LICENSE](LICENSE).
