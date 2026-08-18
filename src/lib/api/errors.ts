/**
 * An error that belongs to one field rather than to the request as a whole.
 *
 * A service that refuses a submission because of one answer — an email already on file, a code
 * already taken — has more to say than "that failed": it knows which box is wrong. Thrown as
 * this, the response carries the same `fieldErrors` shape a Zod failure produces, so the form
 * lights up that input instead of leaving the person to guess from a toast which of a dozen
 * fields it meant.
 *
 * `fieldMessage` is what sits under the input, where there is room for a few words. `message`
 * is the fuller explanation for the toast — telling somebody what to do about it usually takes
 * a sentence, and a sentence does not fit under a text box.
 */
export class FieldError extends Error {
  readonly field: string;
  readonly fieldMessage: string;

  constructor(field: string, message: string, fieldMessage?: string) {
    super(message);
    this.name = 'FieldError';
    this.field = field;
    this.fieldMessage = fieldMessage ?? message;
  }
}
