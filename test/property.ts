import fc from 'fast-check';
import { vi } from 'vitest';

/**
 * Shared settings for the property tests.
 *
 * - PROPERTY_SCALE multiplies every property's case count for a deeper local run
 *   (`PROPERTY_SCALE=20 npm run test:property`); CI uses the defaults.
 * - PROPERTY_SEED replays a failure exactly: use the seed fast-check printed.
 *
 * Property tests run hundreds of cases, often next to other suites on shared CI runners,
 * so their timeout is generous and grows with the scale.
 */
const scale = Number(process.env['PROPERTY_SCALE'] ?? 1);
if (!(scale > 0)) throw new Error(`PROPERTY_SCALE must be a positive number, not ${String(process.env['PROPERTY_SCALE'])}.`);

const seed = process.env['PROPERTY_SEED'];
if (seed !== undefined) fc.configureGlobal({ seed: Number(seed) });

vi.setConfig({ testTimeout: Math.ceil(60_000 * Math.max(1, scale)) });

/** fast-check parameters for `count` cases, scaled by PROPERTY_SCALE. */
export const runs = (count: number): { numRuns: number } => ({ numRuns: Math.max(1, Math.round(count * scale)) });
