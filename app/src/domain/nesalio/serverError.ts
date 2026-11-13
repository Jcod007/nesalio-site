/** An error line sent by /api/nesalio: its message is for the student, its code tells the page what can be offered next. */
export class NesalioServerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NesalioServerError";
  }
}
