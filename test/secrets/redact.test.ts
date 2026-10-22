import { afterEach, describe, expect, it, vi } from 'vitest';
import { interceptCopyEvent } from '../../src/core';
import { pasteWithoutSecrets, redactSecrets, secretRedactor, type SecretPasteEvent } from '../../src/secrets';
import { FAKES } from './fixtures';

afterEach(() => {
  document.body.replaceChildren();
});

describe('redactSecrets', () => {
  it('replaces each secret with its label, keeping the rest', () => {
    const text = `token=${FAKES.githubToken}\ncard ${FAKES.visa}, thanks`;
    const redacted = redactSecrets(text);
    expect(redacted.text).toBe('token=[redacted GitHub token]\ncard [redacted card number], thanks');
    expect(redacted.findings.map((finding) => finding.kind)).toEqual(['github-token', 'card-number']);
    expect(redacted.truncated).toBe(false);
  });

  it('takes a replacement, and the scan options', () => {
    const text = `${FAKES.githubToken} ${FAKES.twilioKey}`;
    expect(redactSecrets(text, { replace: (finding) => finding.masked, minConfidence: 'high' }).text).toBe(
      `ghp_\u2026${FAKES.githubToken.slice(-4)} ${FAKES.twilioKey}`,
    );
  });

  it('drops text past maxLength rather than pass it on unscanned', () => {
    expect(redactSecrets(`hello ${FAKES.githubToken}`, { maxLength: 8 })).toEqual({ text: 'hello gh', findings: [], truncated: true });
    expect(redactSecrets('plain')).toEqual({ text: 'plain', findings: [], truncated: false });
  });
});

/** A paste event at `target`, carrying `text`. */
function pasteEvent(target: EventTarget | null, text: string | null): SecretPasteEvent & { prevented: boolean } {
  const event = {
    clipboardData: text === null ? null : { getData: (format: string) => (format === 'text/plain' ? text : '') },
    currentTarget: target,
    target,
    defaultPrevented: false,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  return event;
}

function textarea(value = 'Hi '): HTMLTextAreaElement {
  const field = document.createElement('textarea');
  field.value = value;
  document.body.append(field);
  field.setSelectionRange(value.length, value.length);
  return field;
}

describe('pasteWithoutSecrets', () => {
  it('inserts the paste with its secrets redacted, and says what it found', () => {
    const field = textarea();
    const onSecrets = vi.fn();
    const event = pasteEvent(field, `here is my key ${FAKES.stripeKey}`);
    expect(pasteWithoutSecrets(event, { onSecrets })).toBe('redacted');
    expect(event.prevented).toBe(true);
    expect(field.value).toBe('Hi here is my key [redacted Stripe live key]');
    expect(onSecrets).toHaveBeenCalledWith([expect.objectContaining({ kind: 'stripe-key' })], 'redacted');
  });

  it('blocks the paste when asked, or where text cannot be inserted', () => {
    const field = textarea();
    const blocked = pasteEvent(field, FAKES.githubToken);
    expect(pasteWithoutSecrets(blocked, { action: 'block' })).toBe('blocked');
    expect(blocked.prevented).toBe(true);
    expect(field.value).toBe('Hi ');

    const div = document.createElement('div');
    div.contentEditable = 'true';
    expect(pasteWithoutSecrets(pasteEvent(div, FAKES.githubToken))).toBe('blocked');

    const readOnly = textarea();
    readOnly.readOnly = true;
    const onSecrets = vi.fn();
    expect(pasteWithoutSecrets(pasteEvent(readOnly, FAKES.githubToken), { onSecrets })).toBe('blocked');
    expect(onSecrets).toHaveBeenCalledWith(expect.any(Array), 'blocked');
  });

  it('leaves clean pastes, empty ones and handled ones to the browser', () => {
    const field = textarea();
    for (const event of [pasteEvent(field, 'Just words.'), pasteEvent(field, ''), pasteEvent(field, null)]) {
      expect(pasteWithoutSecrets(event)).toBe('clean');
      expect(event.prevented).toBe(false);
    }
    const handled = { ...pasteEvent(field, FAKES.githubToken), defaultPrevented: true };
    expect(pasteWithoutSecrets(handled)).toBe('clean');
  });

  it('treats a paste too long to scan as holding secrets', () => {
    const field = textarea('');
    expect(pasteWithoutSecrets(pasteEvent(field, 'abcdefghij'), { maxLength: 4 })).toBe('redacted');
    expect(field.value).toBe('abcd');
  });

  it('works on the target when the handler sits on a parent', () => {
    const field = textarea('');
    const event = { ...pasteEvent(field, FAKES.npmToken), currentTarget: document.body };
    expect(pasteWithoutSecrets(event)).toBe('redacted');
    expect(field.value).toBe('[redacted npm token]');
  });
});

describe('secretRedactor', () => {
  /** A copy of `text` selected in a <pre>, through the interceptor. */
  function copy(text: string, transform = secretRedactor()) {
    const pre = document.createElement('pre');
    pre.textContent = text;
    document.body.append(pre);
    const range = document.createRange();
    range.selectNodeContents(pre);
    const selection = document.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
    const data = new Map<string, string>();
    const event = {
      type: 'copy',
      clipboardData: { setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) ?? '', clearData: () => { data.clear(); } },
      defaultPrevented: false,
      target: pre,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    const outcome = interceptCopyEvent(event, { transform });
    return { outcome, data };
  }

  it('redacts secrets in what people copy, as plain text', () => {
    const { outcome, data } = copy(`2026-10-22 auth ok token=${FAKES.githubToken}`);
    expect(outcome.status).toBe('written');
    expect(data.get('text/plain')).toBe('2026-10-22 auth ok token=[redacted GitHub token]');
    expect(data.has('text/html')).toBe(false);
  });

  it('leaves copies without secrets to the browser', () => {
    expect(copy('2026-10-22 auth ok').outcome).toMatchObject({ status: 'passed', reason: 'declined' });
  });

  it('redacts a copy too long to scan', () => {
    expect(copy('abcdefghij', secretRedactor({ maxLength: 3 })).data.get('text/plain')).toBe('abc');
  });
});
