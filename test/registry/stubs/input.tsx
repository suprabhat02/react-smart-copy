/** Stands in for shadcn's Input. */
import type { ComponentProps, JSX } from 'react';

export function Input(props: ComponentProps<'input'>): JSX.Element {
  return <input {...props} />;
}
