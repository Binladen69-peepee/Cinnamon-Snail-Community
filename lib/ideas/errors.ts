/**
 * A refusal the member (or a staff member) can act on.
 *
 * Every mutation on the board throws one of these rather than returning a
 * flag nobody checks; the actions turn it into a sentence next to the button.
 * Anything that is not an `IdeaError` is a real fault and is left to the error
 * boundary and the logs.
 */
export type IdeaErrorCode =
  | "sign_in"
  | "forbidden"
  | "gone"
  | "invalid"
  | "duplicate"
  | "rate_limited"
  | "own"
  | "closed"
  | "merged"
  | "locked"
  | "in_use"
  | "same"
  | "target_merged"
  | "target_gone";

export class IdeaError extends Error {
  readonly code: IdeaErrorCode;
  /** For "duplicate": the idea already on the board. */
  readonly existing?: { id: string; title: string };
  /** For "invalid": which field, so the form can say it there. */
  readonly field?: "title" | "body" | "category" | "status" | "note";

  constructor(
    code: IdeaErrorCode,
    message: string,
    extra: {
      existing?: { id: string; title: string };
      field?: "title" | "body" | "category" | "status" | "note";
    } = {},
  ) {
    super(message);
    this.name = "IdeaError";
    this.code = code;
    this.existing = extra.existing;
    this.field = extra.field;
  }
}

export function isIdeaError(error: unknown): error is IdeaError {
  return error instanceof IdeaError;
}
