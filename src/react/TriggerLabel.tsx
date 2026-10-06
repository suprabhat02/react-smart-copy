import { useMediaQuery } from './useMediaQuery';

/**
 * Default trigger label shared by `CopyField` and `PasteField`: every state's
 * text is stacked in one grid cell, so the button is always as wide as its
 * longest label and never resizes (no layout shift). Only the active label is
 * visible and exposed to assistive tech; the crossfade is skipped when the
 * user prefers reduced motion.
 */
export function TriggerLabel<S extends string>({
  status,
  labels,
}: {
  readonly status: S;
  readonly labels: Readonly<Record<S, string>>;
}) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  return (
    <span style={{ display: 'inline-grid' }}>
      {(Object.keys(labels) as S[]).map((candidate) => {
        const active = candidate === status;
        return (
          <span
            key={candidate}
            data-trigger-label={candidate}
            data-active={active ? '' : undefined}
            aria-hidden={!active || undefined}
            style={{
              gridArea: '1 / 1',
              opacity: active ? 1 : 0,
              visibility: active ? 'visible' : 'hidden',
              ...(reduceMotion ? {} : { transition: 'opacity 150ms ease, visibility 150ms' }),
            }}
          >
            {labels[candidate]}
          </span>
        );
      })}
    </span>
  );
}
