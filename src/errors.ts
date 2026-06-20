/**
 * Typed error hierarchy for the Demografix SDK.
 *
 * Every error extends {@link DemografixError}. Non-2xx responses map to a
 * subclass by status code; network, timeout, and non-JSON failures raise
 * {@link TransportError}.
 */

import type { Quota } from "./models.js";

/** Base error for every failure raised by the SDK. */
export class DemografixError extends Error {
  /** HTTP status code, or `undefined` for transport failures. */
  readonly status: number | undefined;
  /** Quota parsed from the response headers, or `null` when unavailable. */
  readonly quota: Quota | null;

  constructor(message: string, status?: number, quota: Quota | null = null) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.quota = quota;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Raised on 401. The API key is missing or invalid. */
export class AuthError extends DemografixError {}

/** Raised on 402. The subscription is expired or inactive. */
export class SubscriptionError extends DemografixError {}

/**
 * Raised on 422, and client-side before any HTTP call when a batch exceeds
 * ten names.
 */
export class ValidationError extends DemografixError {}

/** Raised on 429. The request limit was reached. Carries a populated quota. */
export class RateLimitError extends DemografixError {}

/** Raised on network failure, timeout, or a non-JSON response body. */
export class TransportError extends DemografixError {}
