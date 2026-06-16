/**
 * Domain errors. Each carries the HTTP status it should map to, so the
 * presentation layer can translate failures without a pile of `if` checks.
 * Errors that don't extend `AppError` are treated as unexpected (500).
 */

/** Base class for errors that map to a specific HTTP status code. */
export abstract class AppError extends Error {
  // HTTP status this error maps to (defined by each subclass).
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The uploaded bytes are not a valid MPEG-1 Audio Layer III stream. */
export class InvalidMp3Error extends AppError {
  // Bad or unparseable input -> 400 Bad Request.
  readonly statusCode = 400;
}

/** The upload exceeded the maximum allowed size. */
export class PayloadTooLargeError extends AppError {
  // Upload over the size limit -> 413 Payload Too Large.
  readonly statusCode = 413;
}
