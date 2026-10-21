/** Metro/Jest stand-in so the mobile app can import the API totals helper without bundling Hono. */
export class HTTPException extends Error {
  readonly status: number;

  constructor(status: number, options?: { message?: string; cause?: unknown }) {
    super(options?.message ?? '');
    this.name = 'HTTPException';
    this.status = status;
    if (options && 'cause' in options) {
      this.cause = options.cause;
    }
  }
}
