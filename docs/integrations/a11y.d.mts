import type { AstroIntegration } from 'astro';

/** Names the search button by its content, so its visible text is part of its name. */
export declare function fixSearchShortcut(html: string, file?: string): string;
/** Makes every code block focusable, so Expressive Code never gives one an unnamed region role. */
export declare function focusableCodeBlocks(html: string): string;
export default function a11y(): AstroIntegration;
