/** Drizzle breakpoints are generator metadata. A trailing comment-only segment
 * is rejected by Durable Object SQL, so omit markers at execution time while
 * preserving the original migration text and checksum for immutability checks. */
export function executableMigrationSql(source: string): string {
  return source.replace(/--> statement-breakpoint/g, '').trim();
}
