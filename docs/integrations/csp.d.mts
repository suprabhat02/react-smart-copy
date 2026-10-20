import type { AstroIntegration } from 'astro';

/** The Content Security Policy for one built page: its inline scripts and styles allowed by hash. */
export declare function policy(html: string): string;
export default function csp(): AstroIntegration;
