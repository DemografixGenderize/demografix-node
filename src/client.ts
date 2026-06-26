/**
 * The Demografix client: one class covering genderize, agify, and nationalize.
 */

import {
  AuthError,
  DemografixError,
  RateLimitError,
  SubscriptionError,
  TransportError,
  ValidationError,
} from "./errors.js";
import type {
  AgifyOptions,
  AgifyPrediction,
  AgifyResult,
  Batch,
  DemografixOptions,
  GenderizeOptions,
  GenderizePrediction,
  GenderizeResult,
  NationalizeOptions,
  NationalizePrediction,
  NationalizeResult,
  Quota,
} from "./models.js";

/** SDK version, stamped into the User-Agent. */
const VERSION = "0.1.0";

/** User-Agent sent on every request. Hardcoded, not an option. */
const USER_AGENT = `demografix-typescript/${VERSION}`;

/** Per-service base URLs. Hardcoded, not options. */
const BASE_URLS = {
  genderize: "https://api.genderize.io/",
  agify: "https://api.agify.io/",
  nationalize: "https://api.nationalize.io/",
} as const;

/** Maximum names accepted in a single batch request. */
const MAX_BATCH = 10;

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT = 10000;

type Service = keyof typeof BASE_URLS;

/** Raw response captured by the transport seam, before parsing. */
interface RawResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  /** The parsed JSON body, or a parse failure. */
  json: () => Promise<unknown>;
}

/**
 * Client for the three Demografix APIs.
 *
 * Construct once with an API key, then call any of the six methods. The key is
 * required: constructing without a non-empty key throws a {@link ValidationError}
 * before any request. Quota is read off the returned value or a raised error; it
 * is never cached on the client.
 */
export class Demografix {
  private readonly apiKey: string;
  private readonly timeout: number;

  /**
   * @param apiKey - The API key sent as the `apikey` query parameter on every
   *   request. Required. A missing, empty, or blank key throws a
   *   {@link ValidationError} before any HTTP call. The same key works across
   *   all three services.
   * @param options - Optional `timeout` in milliseconds (defaults to 10000).
   */
  constructor(apiKey: string, options: DemografixOptions = {}) {
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      throw new ValidationError("api_key is required");
    }
    this.apiKey = apiKey;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Predict gender for a single name.
   *
   * @param name - The name to classify.
   * @param options - Optional `countryId` to scope the prediction and `signal`
   *   to cancel the request.
   * @returns The prediction fields plus the quota read from the response.
   * @throws {ValidationError} on a 422 response.
   * @throws {DemografixError} (or a subclass) on any other non-2xx response.
   * @throws {TransportError} on a network failure, timeout, or non-JSON body.
   */
  async genderize(
    name: string,
    options: GenderizeOptions = {},
  ): Promise<GenderizeResult> {
    const { json, quota } = await this.request("genderize", [name], options);
    return { ...parseGenderize(json), quota };
  }

  /**
   * Predict gender for up to ten names, returning one quota for the batch.
   *
   * @param names - The names to classify. More than ten throws a
   *   {@link ValidationError} before any request is made.
   * @param options - Optional `countryId` to scope the predictions and `signal`
   *   to cancel the request.
   * @returns The per-name predictions plus one quota for the response.
   */
  async genderizeBatch(
    names: string[],
    options: GenderizeOptions = {},
  ): Promise<Batch<GenderizePrediction>> {
    this.assertBatchSize(names);
    const { json, quota } = await this.request("genderize", names, options);
    return { results: asArray(json).map(parseGenderize), quota };
  }

  /**
   * Predict age for a single name.
   *
   * @param name - The name to classify.
   * @param options - Optional `countryId` to scope the prediction and `signal`
   *   to cancel the request.
   * @returns The prediction fields plus the quota read from the response.
   */
  async agify(name: string, options: AgifyOptions = {}): Promise<AgifyResult> {
    const { json, quota } = await this.request("agify", [name], options);
    return { ...parseAgify(json), quota };
  }

  /**
   * Predict age for up to ten names, returning one quota for the batch.
   *
   * @param names - The names to classify. More than ten throws a
   *   {@link ValidationError} before any request is made.
   * @param options - Optional `countryId` to scope the predictions and `signal`
   *   to cancel the request.
   * @returns The per-name predictions plus one quota for the response.
   */
  async agifyBatch(
    names: string[],
    options: AgifyOptions = {},
  ): Promise<Batch<AgifyPrediction>> {
    this.assertBatchSize(names);
    const { json, quota } = await this.request("agify", names, options);
    return { results: asArray(json).map(parseAgify), quota };
  }

  /**
   * Predict nationality for a single name.
   *
   * @param name - The name to classify.
   * @param options - Optional `signal` to cancel the request. Nationalize takes
   *   no country.
   * @returns The prediction fields plus the quota read from the response.
   */
  async nationalize(
    name: string,
    options: NationalizeOptions = {},
  ): Promise<NationalizeResult> {
    const { json, quota } = await this.request("nationalize", [name], options);
    return { ...parseNationalize(json), quota };
  }

  /**
   * Predict nationality for up to ten names, returning one quota for the batch.
   *
   * @param names - The names to classify. More than ten throws a
   *   {@link ValidationError} before any request is made.
   * @param options - Optional `signal` to cancel the request. Nationalize takes
   *   no country.
   * @returns The per-name predictions plus one quota for the response.
   */
  async nationalizeBatch(
    names: string[],
    options: NationalizeOptions = {},
  ): Promise<Batch<NationalizePrediction>> {
    this.assertBatchSize(names);
    const { json, quota } = await this.request("nationalize", names, options);
    return { results: asArray(json).map(parseNationalize), quota };
  }

  private assertBatchSize(names: string[]): void {
    if (names.length > MAX_BATCH) {
      throw new ValidationError(
        `Batch exceeds the ${MAX_BATCH}-name limit (received ${names.length})`,
      );
    }
  }

  /**
   * Issue the request, parse the quota headers, and on a non-2xx response throw
   * the mapped typed error. Returns the parsed JSON body and quota on success.
   */
  private async request(
    service: Service,
    names: string[],
    options: { countryId?: string; signal?: AbortSignal },
  ): Promise<{ json: unknown; quota: Quota }> {
    const url = this.buildUrl(service, names, options.countryId);
    const raw = await this.send(url, options.signal);
    const quota = parseQuota(raw.headers);

    let body: unknown;
    try {
      body = await raw.json();
    } catch {
      throw new TransportError(
        `Non-JSON response from ${service} (status ${raw.status})`,
        raw.status,
        quota,
      );
    }

    if (!raw.ok) {
      throw mapError(raw.status, body, quota);
    }

    return { json: body, quota };
  }

  /** Build the request URL with repeated `name[]` for batches, `name` for one. */
  private buildUrl(service: Service, names: string[], countryId?: string): string {
    const url = new URL(BASE_URLS[service]);
    const params = url.searchParams;
    if (names.length === 1) {
      params.set("name", names[0]!);
    } else {
      for (const n of names) {
        params.append("name[]", n);
      }
    }
    if (countryId !== undefined) {
      params.set("country_id", countryId);
    }
    params.set("apikey", this.apiKey);
    return url.toString();
  }

  /**
   * Transport seam. Calls the global `fetch` with the hardcoded User-Agent and
   * an abort signal that fires when the timeout elapses or the caller's signal
   * aborts. Tests stub `fetch` to return canned responses; this is the only
   * point where the network is touched.
   */
  private async send(url: string, signal?: AbortSignal): Promise<RawResponse> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeout);
    const onAbort = (): void => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      controller.abort();
    }
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      return {
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        json: () => response.json(),
      };
    } catch (err) {
      if (timedOut) {
        throw new TransportError(`Request to ${url} timed out after ${this.timeout}ms`);
      }
      if (signal?.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new TransportError(`Request to ${url} was aborted`);
      }
      const reason = err instanceof Error ? err.message : String(err);
      throw new TransportError(`Request to ${url} failed: ${reason}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/** Parse the three rate-limit headers case-insensitively. */
function parseQuota(headers: Headers): Quota {
  return {
    limit: readInt(headers, "x-rate-limit-limit"),
    remaining: readInt(headers, "x-rate-limit-remaining"),
    reset: readInt(headers, "x-rate-limit-reset"),
  };
}

/** Read a header as an integer. `Headers.get` is already case-insensitive. */
function readInt(headers: Headers, name: string): number {
  const raw = headers.get(name);
  const value = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isNaN(value) ? 0 : value;
}

/** Map a non-2xx status and body to the matching typed error. */
function mapError(status: number, body: unknown, quota: Quota): DemografixError {
  const message = errorMessage(body, status);
  switch (status) {
    case 401:
      return new AuthError(message, status, quota);
    case 402:
      return new SubscriptionError(message, status, quota);
    case 422:
      return new ValidationError(message, status, quota);
    case 429:
      return new RateLimitError(message, status, quota);
    default:
      return new DemografixError(message, status, quota);
  }
}

/** Pull the `error` string from the body, falling back to a status message. */
function errorMessage(body: unknown, status: number): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return `Request failed with status ${status}`;
}

function asArray(json: unknown): unknown[] {
  return Array.isArray(json) ? json : [];
}

function obj(json: unknown): Record<string, unknown> {
  return typeof json === "object" && json !== null
    ? (json as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function intOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function parseGenderize(json: unknown): GenderizePrediction {
  const o = obj(json);
  const gender = o["gender"];
  return {
    name: str(o["name"]),
    gender: gender === "male" || gender === "female" ? gender : null,
    probability: num(o["probability"]),
    count: num(o["count"]),
    countryId: strOrNull(o["country_id"]),
  };
}

function parseAgify(json: unknown): AgifyPrediction {
  const o = obj(json);
  return {
    name: str(o["name"]),
    age: intOrNull(o["age"]),
    count: num(o["count"]),
    countryId: strOrNull(o["country_id"]),
  };
}

function parseNationalize(json: unknown): NationalizePrediction {
  const o = obj(json);
  const country = Array.isArray(o["country"]) ? o["country"] : [];
  return {
    name: str(o["name"]),
    country: country.map((c) => {
      const e = obj(c);
      return {
        countryId: str(e["country_id"]),
        probability: num(e["probability"]),
      };
    }),
    count: num(o["count"]),
  };
}
