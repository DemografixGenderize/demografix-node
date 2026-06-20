import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AuthError,
  Demografix,
  DemografixError,
  RateLimitError,
  SubscriptionError,
  TransportError,
  ValidationError,
} from "../src/index.js";

/** The rate-limit headers present on every fixture response. */
const HEADERS = {
  "x-rate-limit-limit": "25000",
  "x-rate-limit-remaining": "24987",
  "x-rate-limit-reset": "1314000",
};

/** Build a real Response carrying the fixture headers. */
function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...HEADERS },
  });
}

/** Stub the global fetch to capture the URL and return a canned response. */
function stubFetch(status: number, body: unknown): { url: () => string } {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (input: string | URL) => {
    calls.push(typeof input === "string" ? input : input.toString());
    return Promise.resolve(response(status, body));
  });
  return { url: () => calls.at(-1) ?? "" };
}

/** Await a promise expected to reject and return the caught error, typed. */
async function rejection<E extends DemografixError>(promise: Promise<unknown>): Promise<E> {
  try {
    await promise;
  } catch (err) {
    return err as E;
  }
  throw new Error("expected the promise to reject");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("single predictions parse fields and quota", () => {
  it("genderize", async () => {
    stubFetch(200, { count: 1352696, name: "peter", gender: "male", probability: 1.0 });
    const result = await new Demografix().genderize("peter");
    expect(result.name).toBe("peter");
    expect(result.gender).toBe("male");
    expect(result.probability).toBe(1.0);
    expect(result.count).toBe(1352696);
    expect(result.countryId).toBeNull();
    expect(result.quota).toEqual({ limit: 25000, remaining: 24987, reset: 1314000 });
  });

  it("agify", async () => {
    stubFetch(200, { count: 311558, name: "michael", age: 57 });
    const result = await new Demografix().agify("michael");
    expect(result.age).toBe(57);
    expect(result.count).toBe(311558);
    expect(result.quota.remaining).toBe(24987);
  });

  it("nationalize", async () => {
    stubFetch(200, {
      count: 100783,
      name: "nguyen",
      country: [
        { country_id: "VN", probability: 0.891132 },
        { country_id: "MO", probability: 0.019031 },
      ],
    });
    const result = await new Demografix().nationalize("nguyen");
    expect(result.country).toHaveLength(2);
    expect(result.country[0]).toEqual({ countryId: "VN", probability: 0.891132 });
    expect(result.quota.remaining).toBe(24987);
  });
});

describe("batch", () => {
  it("preserves result order and parses one quota", async () => {
    stubFetch(200, [
      { count: 311558, name: "michael", age: 57 },
      { count: 55682, name: "matthew", age: 48 },
    ]);
    const batch = await new Demografix().agifyBatch(["michael", "matthew"]);
    expect(batch.results.map((r) => r.name)).toEqual(["michael", "matthew"]);
    expect(batch.results.map((r) => r.age)).toEqual([57, 48]);
    expect(batch.quota.remaining).toBe(24987);
  });

  it("sends repeated name[] parameters", async () => {
    const fetch = stubFetch(200, [
      { count: 311558, name: "michael", age: 57 },
      { count: 55682, name: "matthew", age: 48 },
    ]);
    await new Demografix().agifyBatch(["michael", "matthew"]);
    const url = new URL(fetch.url());
    expect(url.searchParams.getAll("name[]")).toEqual(["michael", "matthew"]);
    expect(url.searchParams.has("name")).toBe(false);
  });

  it("sends a single name parameter for single calls", async () => {
    const fetch = stubFetch(200, { count: 1352696, name: "peter", gender: "male", probability: 1.0 });
    await new Demografix().genderize("peter");
    const url = new URL(fetch.url());
    expect(url.searchParams.get("name")).toBe("peter");
    expect(url.searchParams.has("name[]")).toBe(false);
  });
});

describe("null predictions are normal results", () => {
  it("genderize null", async () => {
    stubFetch(200, { name: "xÿz", gender: null, probability: 0.0, count: 0 });
    const result = await new Demografix().genderize("xÿz");
    expect(result.gender).toBeNull();
    expect(result.probability).toBe(0.0);
    expect(result.count).toBe(0);
  });

  it("agify null", async () => {
    stubFetch(200, { name: "xÿz", age: null, count: 0 });
    const result = await new Demografix().agify("xÿz");
    expect(result.age).toBeNull();
  });

  it("nationalize null", async () => {
    stubFetch(200, { name: "xÿz", country: [], count: 0 });
    const result = await new Demografix().nationalize("xÿz");
    expect(result.country).toEqual([]);
  });
});

describe("country_id", () => {
  it("round-trips into the request and back from the response", async () => {
    const fetch = stubFetch(200, {
      count: 196601,
      name: "kim",
      gender: "female",
      country_id: "US",
      probability: 0.94,
    });
    const result = await new Demografix().genderize("kim", { countryId: "US" });
    const url = new URL(fetch.url());
    expect(url.searchParams.get("country_id")).toBe("US");
    expect(result.countryId).toBe("US");
    expect(result.gender).toBe("female");
  });

  it("is omitted from the request when not set", async () => {
    const fetch = stubFetch(200, { count: 1352696, name: "peter", gender: "male", probability: 1.0 });
    await new Demografix().genderize("peter");
    expect(new URL(fetch.url()).searchParams.has("country_id")).toBe(false);
  });
});

describe("apikey", () => {
  it("is sent when configured", async () => {
    const fetch = stubFetch(200, { count: 1352696, name: "peter", gender: "male", probability: 1.0 });
    await new Demografix({ apiKey: "secret" }).genderize("peter");
    expect(new URL(fetch.url()).searchParams.get("apikey")).toBe("secret");
  });

  it("is omitted in the free tier", async () => {
    const fetch = stubFetch(200, { count: 1352696, name: "peter", gender: "male", probability: 1.0 });
    await new Demografix().genderize("peter");
    expect(new URL(fetch.url()).searchParams.has("apikey")).toBe(false);
  });
});

describe("client-side batch validation", () => {
  it("raises ValidationError for 11 names with no HTTP call", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const names = Array.from({ length: 11 }, (_, i) => `name${i}`);
    await expect(new Demografix().genderizeBatch(names)).rejects.toBeInstanceOf(ValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows exactly 10 names", async () => {
    const fetch = stubFetch(200, Array.from({ length: 10 }, (_, i) => ({ name: `n${i}`, age: i, count: 1 })));
    const names = Array.from({ length: 10 }, (_, i) => `n${i}`);
    const batch = await new Demografix().agifyBatch(names);
    expect(batch.results).toHaveLength(10);
    expect(fetch.url()).not.toBe("");
  });
});

describe("error mapping", () => {
  const cases: [number, string, new (...a: never[]) => DemografixError][] = [
    [401, "Invalid API key", AuthError],
    [402, "Subscription is not active", SubscriptionError],
    [422, "Missing 'name' parameter", ValidationError],
    [429, "Request limit reached", RateLimitError],
  ];

  for (const [status, message, type] of cases) {
    it(`maps ${status} to ${type.name}`, async () => {
      stubFetch(status, { error: message });
      const err = await rejection(new Demografix().genderize("peter"));
      expect(err).toBeInstanceOf(type);
      expect(err).toBeInstanceOf(DemografixError);
      expect(err.status).toBe(status);
      expect(err.message).toBe(message);
    });
  }

  it("attaches quota to a 429", async () => {
    stubFetch(429, { error: "Request limit reached" });
    const err = await rejection<RateLimitError>(new Demografix().genderize("peter"));
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.quota).toEqual({ limit: 25000, remaining: 24987, reset: 1314000 });
  });

  it("maps an unmapped non-2xx status to the base error", async () => {
    stubFetch(500, { error: "Internal error" });
    const err = await rejection(new Demografix().genderize("peter"));
    expect(err.constructor).toBe(DemografixError);
    expect(err.status).toBe(500);
  });
});

describe("cancellation", () => {
  it("forwards the caller signal to fetch", async () => {
    const signals: (AbortSignal | undefined | null)[] = [];
    vi.stubGlobal("fetch", (_input: string | URL, init?: RequestInit) => {
      signals.push(init?.signal);
      return Promise.resolve(response(200, { name: "peter", gender: "male", probability: 1.0, count: 1 }));
    });
    const controller = new AbortController();
    await new Demografix().genderize("peter", { signal: controller.signal });
    expect(signals.at(-1)).toBeInstanceOf(AbortSignal);
  });

  it("rejects with the caller's reason when the signal is already aborted, and never completes the request", async () => {
    let fetchSettled = false;
    vi.stubGlobal("fetch", (_input: string | URL, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(init.signal.reason ?? new DOMException("aborted", "AbortError"));
          return;
        }
        fetchSettled = true;
        resolve(response(200, { name: "peter", gender: "male", probability: 1.0, count: 1 }));
      });
    });
    const reason = new Error("caller cancelled");
    const err = await rejection(
      new Demografix().genderize("peter", { signal: AbortSignal.abort(reason) }),
    );
    // The caller's own abort reason propagates as-is, the way fetch does it.
    expect(err).toBe(reason);
    expect(fetchSettled).toBe(false);
  });

  it("surfaces a TransportError on a network failure", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("network down")));
    const err = await rejection(new Demografix().genderize("peter"));
    expect(err).toBeInstanceOf(TransportError);
    expect(err.status).toBeUndefined();
    expect(err.quota).toBeNull();
  });
});

describe("quota header parsing is case-insensitive", () => {
  it("reads upper-cased header names", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify({ name: "peter", gender: "male", probability: 1.0, count: 1 }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "X-Rate-Limit-Limit": "25000",
            "X-Rate-Limit-Remaining": "24987",
            "X-Rate-Limit-Reset": "1314000",
          },
        }),
      ),
    );
    const result = await new Demografix().genderize("peter");
    expect(result.quota.remaining).toBe(24987);
  });
});
