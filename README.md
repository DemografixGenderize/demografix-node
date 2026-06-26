# Demografix TypeScript SDK

Run demographic analysis over names — predicted gender, age, and nationality — from one client. The package covers genderize.io, agify.io, and nationalize.io.

## Install

```sh
npm install demografix
```

The SDK ships ESM, CommonJS, and type declarations. It uses the global `fetch` and has zero runtime dependencies. It runs on Node 20 or later and in browsers with `fetch`. Browsers omit the `User-Agent` header, which is a forbidden header name, so requests sent from a browser are not tagged with the SDK user agent.

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

An API key is required. Creating one is free and includes 2,500 requests per month. Generate a key in your dashboard at genderize.io, agify.io, or nationalize.io. One key works across all three services.

## genderize

Predict gender. A single call returns the prediction fields plus a `quota`.

```ts
const g = await client.genderize("peter");
g.gender;           // "male" | "female" | null
g.probability;      // 1.0
g.count;            // 1352696
g.quota.remaining;  // 24987
```

The batch form takes up to ten names and returns the gender split of the list.

```ts
const batch = await client.genderizeBatch(["peter", "lois", "kim"]);
const split = { male: 0, female: 0, unknown: 0 };
for (const r of batch.results) {
  split[r.gender ?? "unknown"] += 1;
}
split;  // a count per category across the list
```

## agify

Predict age.

```ts
const a = await client.agify("michael");
a.age;    // 57 | null
a.count;  // 311558

const batch = await client.agifyBatch(["michael", "matthew"]);
const mean =
  batch.results.reduce((sum, r) => sum + (r.age ?? 0), 0) / batch.results.length;
```

## nationalize

Predict nationality. Each prediction carries up to five candidate countries in descending probability.

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

## country_id

`genderize` and `agify` accept an optional `countryId` (ISO 3166-1 alpha-2) to scope the prediction to a country. The code is echoed back uppercase on the result. `nationalize` does not take a country.

```ts
const batch = await client.agifyBatch(["andrea", "jean", "kim"], { countryId: "DE" });

// Scope every prediction to Germany, then aggregate into an age distribution.
const distribution: Record<string, number> = {};
for (const r of batch.results) {
  if (r.age === null) continue;
  const decade = `${Math.floor(r.age / 10) * 10}s`;
  distribution[decade] = (distribution[decade] ?? 0) + 1;
}
distribution;          // an age distribution scoped to one country
batch.results[0]?.countryId;  // "DE", echoed uppercase on each prediction
```

## Quota

Every result and every raised error carries a `quota` read from the response headers.

| Field | Meaning |
|---|---|
| `limit` | names allowed in the current window |
| `remaining` | names left in the current window |
| `reset` | seconds until the window resets |

Quota is read off a returned value or a caught error. The client does not cache it.

## Errors

Non-2xx responses throw a typed error. Every error extends `DemografixError`, which extends `Error`, and carries `status`, `message`, and `quota`.

| Class | Cause |
|---|---|
| `AuthError` | 401, missing or invalid API key |
| `SubscriptionError` | 402, subscription expired or inactive |
| `ValidationError` | 422, and client-side when a batch exceeds ten names |
| `RateLimitError` | 429, request limit reached; `quota` always populated |
| `TransportError` | network failure, timeout, or non-JSON body |
| `DemografixError` | base type, and any other non-2xx status |

A batch of more than ten names throws `ValidationError` before any HTTP call.

On a `RateLimitError`, `quota.reset` reports the seconds until the window resets. Wait that long before retrying.

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

## Cancellation

Every method accepts an optional `AbortSignal`, composed with the client's own timeout. The request ends when either the signal aborts or the timeout elapses.

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 500);

const batch = await client.nationalizeBatch(names, { signal: controller.signal });
```

When the caller's signal aborts first, its abort reason propagates as-is, the way `fetch` raises it. When the internal timeout elapses, the call throws a `TransportError`.

## Methods

| Method | Returns | country_id |
|---|---|---|
| `genderize(name, options?)` | `GenderizeResult` | yes |
| `genderizeBatch(names, options?)` | `Batch<GenderizePrediction>` | yes |
| `agify(name, options?)` | `AgifyResult` | yes |
| `agifyBatch(names, options?)` | `Batch<AgifyPrediction>` | yes |
| `nationalize(name, options?)` | `NationalizeResult` | no |
| `nationalizeBatch(names, options?)` | `Batch<NationalizePrediction>` | no |

All methods are async and return a Promise. Every method's `options` takes an optional `signal` (`AbortSignal`) for cancellation; genderize and agify also take `countryId`. The constructor takes `new Demografix(apiKey, { timeout? })`; `apiKey` is required and `timeout` defaults to 10000 milliseconds. Base URLs and the User-Agent are fixed constants, not options.

## Reference

Full API reference: https://genderize.io/documentation/api
