export interface Release {
  readonly version: string;
  readonly type: 'major' | 'minor' | 'patch' | 'initial';
  readonly html: string;
}
export declare function parseChangelog(markdown: string): Release[];
