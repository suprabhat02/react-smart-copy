import { describe, expect, it } from 'vitest';
import { PROMPT_STYLES, normalizeCode } from '../../src/code';

const typed = expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) });
const join = (...lines: string[]) => lines.join('\n');

describe('normalizeCode: terminal sessions', () => {
  it('copies a shell session as its commands, without prompts or output', () => {
    const session = join('$ npm install react-smart-copy', '', 'added 1 package in 2s', '$ npm test', '> pkg@1.0.0 test', '> vitest run', '', ' Tests  12 passed');
    expect(normalizeCode(session)).toBe(join('npm install react-smart-copy', 'npm test'));
  });

  it('recognises prompts with a virtualenv, user@host and a path', () => {
    expect(normalizeCode(join('(venv) $ pip install x', 'user@box:~/app$ make', '~/app $ ls', '/srv$ pwd', '$', 'out'))).toBe(
      join('pip install x', 'make', 'ls', 'pwd'),
    );
  });

  it('keeps continued commands: trailing backslash, with or without a > prompt', () => {
    expect(normalizeCode(join('$ docker run \\', '>   --rm \\', '>   alpine', 'output'))).toBe(join('docker run \\', '  --rm \\', '  alpine'));
    expect(normalizeCode(join('$ docker run \\', '    --rm \\', '    alpine', 'output'))).toBe(join('docker run \\', '    --rm \\', '    alpine'));
    expect(normalizeCode(join('$ echo \\', '>', 'x'))).toBe('echo \\');
    // Once the first continuation line shows a > prompt, a later line without one is kept whole.
    expect(normalizeCode(join('$ a \\', '> b \\', 'c', 'out'))).toBe(join('a \\', 'b \\', 'c'));
  });

  it('keeps heredocs to their delimiter, quoted or with <<-', () => {
    expect(normalizeCode(join("$ cat <<'EOF' > a.txt", '> $ not a prompt', '> EOF', 'done'))).toBe(join("cat <<'EOF' > a.txt", '$ not a prompt', 'EOF'));
    expect(normalizeCode(join('$ cat <<-END', '\tline', '\tEND', '$ ls'))).toBe(join('cat <<-END', '\tline', '\tEND', 'ls'));
  });

  it('keeps multi-line quotes, but not quotes in comments or escaped ones', () => {
    expect(normalizeCode(join('$ git commit -m "first', 'second"', 'output'))).toBe(join('git commit -m "first', 'second"'));
    expect(normalizeCode(join("$ echo 'it''s' # don't", 'output'))).toBe("echo 'it''s' # don't");
    expect(normalizeCode(join('$ echo \\" ok', 'output'))).toBe('echo \\" ok');
    expect(normalizeCode(join("$ echo 'a\\", "b'", 'output'))).toBe(join("echo 'a\\", "b'"));
    expect(normalizeCode(join('$ echo "<<EOF"', 'output'))).toBe('echo "<<EOF"');
    expect(normalizeCode(join('$ echo a<b && cat <<EOF', 'x', 'EOF', 'out'))).toBe(join('echo a<b && cat <<EOF', 'x', 'EOF'));
    expect(normalizeCode(join('$ cat <<EOF # note', 'x', 'EOF'))).toBe(join('cat <<EOF # note', 'x', 'EOF'));
  });

  it('copies PowerShell, cmd, Python, IPython and Node sessions', () => {
    expect(normalizeCode(join('PS C:\\Users\\me> Get-ChildItem `', '>> -Path x', 'Directory: C:\\', 'PS> exit'))).toBe(join('Get-ChildItem `', '-Path x', 'exit'));
    expect(normalizeCode(join('C:\\Users\\me> dir ^', 'More? /s', ' Volume in drive C'))).toBe(join('dir ^', '/s'));
    expect(normalizeCode(join('>>> def f():', '...     return 1', '...', '>>> f()', '1'))).toBe(join('def f():', '    return 1', '', 'f()'));
    expect(normalizeCode(join('In [1]: x = (1 +', '   ...:      2)', '', 'In [2]: x', 'Out[2]: 3'))).toBe(join('x = (1 +', '     2)', 'x'));
    expect(normalizeCode(join('> [1, 2].map(', '... (n) => n * 2)', '[ 2, 4 ]'), { prompt: 'node' })).toBe(join('[1, 2].map(', '(n) => n * 2)'));
  });

  it("'auto' acts only when the first line has a prompt, and never guesses Node's >", () => {
    expect(normalizeCode(join('npm test', '$ not a prompt here'))).toBe(join('npm test', '$ not a prompt here'));
    expect(normalizeCode(join('> quote', 'text'))).toBe(join('> quote', 'text'));
    expect(normalizeCode(join('', '  $ ls', 'a'))).toBe(join('  $ ls', 'a'));
    expect(normalizeCode(join('', '  $ ls', '  a', '  $ pwd'))).toBe(join('ls', 'pwd'));
    expect(normalizeCode(join('', '$ ls', 'a'))).toBe('ls');
    expect(normalizeCode('')).toBe('');
  });

  it('can be turned off or given a style', () => {
    expect(normalizeCode('$ ls\nout', { prompt: false })).toBe('$ ls\nout');
    expect(normalizeCode('text\n$ ls\nout', { prompt: 'shell' })).toBe('ls');
    expect(PROMPT_STYLES).toEqual(['shell', 'powershell', 'cmd', 'python', 'ipython', 'node']);
  });

  it('takes a custom prompt; matches must start the line and g/y flags are ignored', () => {
    const prompt = { command: /mysql> /gy, continuation: /\s*-> / };
    expect(normalizeCode(join('mysql> SELECT 1', '    -> FROM t;', '+---+', 'mysql> exit'), { prompt })).toBe(join('SELECT 1', 'FROM t;', 'exit'));
    expect(normalizeCode(join('a mysql> b', 'mysql> c'), { prompt: { command: /mysql> / } })).toBe('c');
    expect(normalizeCode(join('% ls', '% pwd'), { prompt: { command: /^% / } })).toBe(join('ls', 'pwd'));
  });

  it('rejects invalid prompt settings', () => {
    expect(() => normalizeCode('x', { prompt: 'zsh' as never })).toThrow(typed);
    expect(() => normalizeCode('x', { prompt: 1 as never })).toThrow(typed);
    expect(() => normalizeCode('x', { prompt: true as never })).toThrow(typed);
    expect(() => normalizeCode('x', { prompt: { command: '^\\$' } as never })).toThrow(typed);
    expect(() => normalizeCode('x', { prompt: { command: /x/, continuation: 'y' } as never })).toThrow(typed);
    expect(() => normalizeCode('x', { prompt: 'toString' as never })).toThrow(typed);
  });
});

describe('normalizeCode: diffs', () => {
  const GIT = join(
    'diff --git a/src/a.ts b/src/a.ts',
    'index 3b18e51..a9c2f4e 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,4 +1,4 @@',
    ' const a = 1;',
    '-const b = 2;',
    '+const b = 3;',
    '--- removed SQL comment',
    '+++ added counter',
    '',
    '\\ No newline at end of file',
    'diff --git a/b.ts b/b.ts',
    'new file mode 100644',
    '',
    '--- /dev/null',
    '+++ b/b.ts',
    '@@ -0,0 +1 @@',
    '+export {};',
  );

  it('copies the code after the change', () => {
    expect(normalizeCode(GIT, { diff: 'after' })).toBe(join('const a = 1;', 'const b = 3;', '++ added counter', '', 'export {};'));
  });

  it('copies the code before the change', () => {
    expect(normalizeCode(GIT, { diff: 'before' })).toBe(join('const a = 1;', 'const b = 2;', '-- removed SQL comment'));
  });

  it('handles a diff that starts with --- and documentation-style diffs without headers', () => {
    expect(normalizeCode(join('--- a/x', '+++ b/x', '@@ -1 +1 @@', '-old', '+new'), { diff: 'after' })).toBe('new');
    expect(normalizeCode(join('function f() {', '-  return 1;', '+  return 2;', '}'), { diff: 'after' })).toBe(join('function f() {', '  return 2;', '}'));
  });

  it('ends a header at the first line that is not one', () => {
    expect(normalizeCode(join('diff --git a b', 'plain line', '+added'), { diff: 'after' })).toBe(join('plain line', 'added'));
  });

  it('rejects an invalid side', () => {
    expect(() => normalizeCode('x', { diff: 'both' as never })).toThrow(typed);
  });
});

describe('normalizeCode: line numbers', () => {
  it('removes typed line numbers when they count up on every line', () => {
    expect(normalizeCode(join('1: const a = 1;', '2: ', '3: if (a) {', '4:   go();', '5: }'), { lineNumbers: true })).toBe(
      join('const a = 1;', '', 'if (a) {', '  go();', '}'),
    );
    expect(normalizeCode(join('  9 | a', ' 10 | b', ' 11 \u2502 c', ' 12'), { lineNumbers: true })).toBe(join('a', 'b', 'c'));
    expect(normalizeCode(join('1 x', '2 y'), { lineNumbers: true })).toBe(join('x', 'y'));
  });

  it('keeps numbers that are code: not counting up, a single line, or a line without one', () => {
    expect(normalizeCode(join('1 apple', '3 pear'), { lineNumbers: true })).toBe(join('1 apple', '3 pear'));
    expect(normalizeCode('42 answer', { lineNumbers: true })).toBe('42 answer');
    expect(normalizeCode(join('1 a', 'b'), { lineNumbers: true })).toBe(join('1 a', 'b'));
    expect(normalizeCode(join('1 a', '2 b'))).toBe(join('1 a', '2 b'));
  });
});

describe('normalizeCode: whitespace and line endings', () => {
  it('dedents by the indentation every line shares, ignoring blank lines', () => {
    expect(normalizeCode(join('', '    if (a) {', '', '      b();', '    }', '  '))).toBe(join('if (a) {', '', '  b();', '}'));
    expect(normalizeCode(join('\t\tx', '\t y'))).toBe(join('\tx', ' y'));
    expect(normalizeCode(join('  a', 'b'))).toBe(join('  a', 'b'));
    expect(normalizeCode(join('  a', '  b'), { dedent: false })).toBe(join('  a', '  b'));
    expect(normalizeCode('   ')).toBe('');
  });

  it('trims trailing whitespace and blank edges unless told not to', () => {
    expect(normalizeCode('\n\na  \t\nb\n\n')).toBe('a\nb');
    expect(normalizeCode('a  \nb', { trimTrailingWhitespace: false })).toBe('a  \nb');
    expect(normalizeCode('\na\n', { trimBlankLines: false })).toBe('\na\n');
    expect(normalizeCode('  \n  a', { trimTrailingWhitespace: false, trimBlankLines: false })).toBe('\na');
  });

  it('normalises every line ending, Unicode separators included', () => {
    expect(normalizeCode('a\r\nb\rc\u2028d\u2029e\u0085f')).toBe('a\nb\nc\nd\ne\nf');
    expect(normalizeCode('a\nb', { lineEnding: 'crlf', finalNewline: true })).toBe('a\r\nb\r\n');
    expect(normalizeCode('', { finalNewline: true })).toBe('');
  });

  it('cleans only when asked, by kind or entirely', () => {
    expect(normalizeCode('x = \u201Cy\u201D\u200B')).toBe('x = \u201Cy\u201D\u200B');
    expect(normalizeCode('x = \u201Cy\u201D\u200B', { clean: true })).toBe('x = "y"');
    expect(normalizeCode('x = \u201Cy\u201D\u200B', { clean: ['invisible'] })).toBe('x = \u201Cy\u201D');
    expect(normalizeCode('p\u043Bint', { clean: true })).toBe('p\u043Bint');
  });

  it('rejects invalid options with a typed error', () => {
    expect(() => normalizeCode('x', { dedent: 'yes' as never })).toThrow(typed);
    expect(() => normalizeCode('x', { lineEnding: 'cr' as never })).toThrow(typed);
    expect(() => normalizeCode('x', { clean: ['bad'] as never })).toThrow(typed);
    expect(() => normalizeCode('x', { lineNumbers: 1 as never })).toThrow(typed);
  });
});
