/** Stands in for shadcn's Button (any base): a button with variant and size. */
import type { ComponentProps, JSX } from 'react';

export function Button({ variant, size, ...props }: ComponentProps<'button'> & { variant?: string; size?: string; asChild?: boolean }): JSX.Element {
  return <button data-variant={variant} data-size={size} {...props} />;
}
