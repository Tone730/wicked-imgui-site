// Error from the account API: `code` is the server's error code (see README → Errors).
export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}
