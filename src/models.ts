/**
 * Type definitions for the Demografix SDK.
 *
 * Field names mirror the API wire format and the cross-language interface
 * contract. Result interfaces extend their prediction interface and add a
 * {@link Quota}.
 */

/** Rate-limit state read from the response headers of every call. */
export interface Quota {
  /** Names allowed in the current window. */
  readonly limit: number;
  /** Names left in the current window. */
  readonly remaining: number;
  /** Seconds until the window resets. */
  readonly reset: number;
}

/** Predicted gender, or `null` when no match exists. */
export type Gender = "male" | "female" | null;

/** A single genderize prediction. */
export interface GenderizePrediction {
  readonly name: string;
  readonly gender: Gender;
  readonly probability: number;
  readonly count: number;
  /** Echoed uppercase ISO 3166-1 alpha-2 code, present only when a country was sent. */
  readonly countryId: string | null;
}

/** A single agify prediction. */
export interface AgifyPrediction {
  readonly name: string;
  readonly age: number | null;
  readonly count: number;
  /** Echoed uppercase ISO 3166-1 alpha-2 code, present only when a country was sent. */
  readonly countryId: string | null;
}

/** One candidate country in a nationalize prediction. */
export interface NationalizeCountry {
  readonly countryId: string;
  readonly probability: number;
}

/** A single nationalize prediction. */
export interface NationalizePrediction {
  readonly name: string;
  /** Up to five candidates, descending probability. Empty when no match exists. */
  readonly country: readonly NationalizeCountry[];
  readonly count: number;
}

/** A single genderize call: prediction fields plus quota. */
export interface GenderizeResult extends GenderizePrediction {
  readonly quota: Quota;
}

/** A single agify call: prediction fields plus quota. */
export interface AgifyResult extends AgifyPrediction {
  readonly quota: Quota;
}

/** A single nationalize call: prediction fields plus quota. */
export interface NationalizeResult extends NationalizePrediction {
  readonly quota: Quota;
}

/** A batch call: per-name predictions plus one quota for the response. */
export interface Batch<T> {
  readonly results: readonly T[];
  readonly quota: Quota;
}

/** Options accepted by every call, single or batch. */
export interface RequestOptions {
  /**
   * Abort signal for cancellation. Composed with the client's internal timeout,
   * so a request ends when either this signal aborts or the timeout elapses.
   */
  signal?: AbortSignal;
}

/** Per-call options for genderize and agify. */
export interface GenderizeOptions extends RequestOptions {
  /** ISO 3166-1 alpha-2 country code to scope the prediction. */
  countryId?: string;
}

/** Per-call options for agify. Alias of {@link GenderizeOptions}. */
export type AgifyOptions = GenderizeOptions;

/** Per-call options for nationalize. Nationalize takes no country. */
export type NationalizeOptions = RequestOptions;

/** Constructor options for {@link Demografix}. */
export interface DemografixOptions {
  /** Request timeout in milliseconds. Defaults to 10000. */
  timeout?: number;
}
