/**
 * react-smart-copy/compat in a real React app, as people use react-copy-to-clipboard: a button,
 * HTML with its plain text, and a menu item whose menu closes on click. Each `onCopy` writes what
 * it got into the page, for e2e/compat.spec.ts to read.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CopyToClipboard } from 'react-smart-copy/compat';

function Report({ id, value }: { id: string; value: string | null }) {
  return <output data-result={id}>{value ?? ''}</output>;
}

function Plain() {
  const [result, setResult] = useState<string | null>(null);
  return (
    <section>
      <CopyToClipboard text="INV-29018" onCopy={(text, ok, outcome) => {
          setResult(`${text}|${String(ok)}|${outcome.status}`);
        }}>
        <button type="button">Copy invoice</button>
      </CopyToClipboard>
      <Report id="plain" value={result} />
    </section>
  );
}

function Html() {
  const [result, setResult] = useState<string | null>(null);
  return (
    <section>
      <CopyToClipboard text="<p>Total: <b>₹ 1,234</b></p><script>alert(1)</script>" options={{ format: 'text/html' }} onCopy={(_text, ok) => {
          setResult(String(ok));
        }}>
        <button type="button">Copy total</button>
      </CopyToClipboard>
      <Report id="html" value={result} />
    </section>
  );
}

function Menu() {
  const [open, setOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  return (
    <section>
      {open ? (
        <div role="menu" aria-label="Share">
          <CopyToClipboard text="https://example.com/doc/42" onCopy={(_text, ok) => {
            setToast(ok ? 'Link copied' : 'Could not copy');
          }}>
            <button type="button" role="menuitem" onClick={() => {
                setOpen(false);
              }}>
              Copy link
            </button>
          </CopyToClipboard>
        </div>
      ) : null}
      <Report id="menu" value={toast} />
    </section>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <>
    <Plain />
    <Html />
    <Menu />
  </>,
);
