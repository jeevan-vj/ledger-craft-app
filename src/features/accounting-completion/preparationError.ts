import { ZodError } from 'zod';

export function preparationError(error: unknown, fallback: string): string {
  if (error instanceof ZodError) {
    if (error.issues.some((issue) => issue.path[0] === 'from' || issue.path[0] === 'to')) return 'Choose valid dates with the period start on or before its end.';
    return 'The worksheet data could not be verified. Check the amounts, adjustment reasons and source references, then try again.';
  }
  return error instanceof Error ? error.message : fallback;
}
