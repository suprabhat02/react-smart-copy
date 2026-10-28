/** Bytes the README may take: npm keeps 65,536, and the page needs room to grow. */
export declare const README_MAX_BYTES: number;
export declare const DOCS_URL: string;
/** The docs pages a README link points to, as paths below the docs URL (`modules/email/`). */
export declare function docsLinks(markdown: string): string[];
/** Pages the docs build writes from another file, by path: they are not in git. */
export declare const GENERATED_PAGES: Readonly<Record<string, string>>;
/** Whether `path` (`modules/email/`) is a page of the docs site, whose sources are in `docsDir`. */
export declare function isDocsPage(path: string, docsDir: string): boolean;
/** The names `source` imports from the package, by entry point. */
export declare function packageImports(source: string): Record<string, string[]>;
/** A TypeScript module that imports and re-exports every name in `imports`, to type-check. */
export declare function importsModule(imports: Record<string, readonly string[]>): string;
