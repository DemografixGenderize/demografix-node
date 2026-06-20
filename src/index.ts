/**
 * Demografix SDK — gender, age, and nationality prediction across a list of
 * names, with quota reported on every result.
 *
 * @packageDocumentation
 */

export { Demografix } from "./client.js";

export {
  DemografixError,
  AuthError,
  SubscriptionError,
  ValidationError,
  RateLimitError,
  TransportError,
} from "./errors.js";

export type {
  Quota,
  Gender,
  GenderizePrediction,
  AgifyPrediction,
  NationalizeCountry,
  NationalizePrediction,
  GenderizeResult,
  AgifyResult,
  NationalizeResult,
  Batch,
  RequestOptions,
  GenderizeOptions,
  AgifyOptions,
  NationalizeOptions,
  DemografixOptions,
} from "./models.js";
