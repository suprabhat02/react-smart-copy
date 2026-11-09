import { useState } from 'react';
import { CopyField, describeCopyError, LiveRegion, useCopy } from 'react-smart-copy';
import { parseTable, type ParsedTable } from 'react-smart-copy/table';

/** The component: label, value, a button, and the announcement, all built in. */
function Field() {
  return (
    <CopyField.Root value="INV-29018" label="Invoice number">
      <div className="row">
        <CopyField.Value />
        <CopyField.Trigger>{({ displayStatus }) => (displayStatus === 'copied' ? 'Copied' : 'Copy')}</CopyField.Trigger>
      </div>
    </CopyField.Root>
  );
}

/** The hook, with your own button: the announcement is yours to render. */
function OwnButton() {
  const { copy, status, error } = useCopy();
  const message = status === 'copied' ? 'Link copied' : error ? describeCopyError(error) : '';
  return (
    <div className="row">
      <button type="button" onClick={() => void copy('https://example.com/invite/42')}>
        {status === 'copied' ? 'Copied' : 'Copy invite link'}
      </button>
      {error ? <span role="alert">{describeCopyError(error)}</span> : null}
      <LiveRegion message={message} />
    </div>
  );
}

/** Paste a range from Excel or Google Sheets: the cells come back as rows. */
function PasteTable() {
  const [table, setTable] = useState<ParsedTable | null>(null);
  return (
    <>
      <textarea
        aria-label="Paste a range from a spreadsheet"
        placeholder="Copy a few cells in Excel or Google Sheets, then paste here."
        onPaste={(event) => {
          event.preventDefault();
          setTable(parseTable({ html: event.clipboardData.getData('text/html'), text: event.clipboardData.getData('text/plain') }));
        }}
      />
      {table ? (
        <table>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}

export function App() {
  return (
    <main>
      <h1>react-smart-copy</h1>
      <section>
        <h2>CopyField</h2>
        <Field />
      </section>
      <section>
        <h2>useCopy with your own button</h2>
        <OwnButton />
      </section>
      <section>
        <h2>Paste a table</h2>
        <PasteTable />
      </section>
    </main>
  );
}
