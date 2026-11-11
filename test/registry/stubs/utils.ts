/** Stands in for shadcn's `cn` (clsx and tailwind-merge): joins the class names given. */
export function cn(...values: unknown[]): string {
  return values.filter((value): value is string => typeof value === 'string' && value !== '').join(' ');
}
