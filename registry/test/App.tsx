// The registry's components in a fresh shadcn project, as a developer would use them. Copied over
// src/App.tsx by the Registry job in CI, then type-checked, linted, built and run in a browser.

import { CopyButton } from "@/components/copy-button"
import { CopyField } from "@/components/copy-field"
import { CopyPageButton } from "@/components/copy-page-button"

export function App() {
  return (
    <main className="flex min-h-svh flex-col gap-8 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Release notes</h1>
        <CopyPageButton />
      </header>
      <section className="flex items-center gap-2" aria-label="Invoice">
        <span>INV-29018</span>
        <CopyButton value="INV-29018" label="Copy invoice number" />
        <CopyButton value={{ kind: "html", html: "<b>Total: ₹ 1,234</b>", text: "Total: ₹ 1,234" }}>Copy total</CopyButton>
      </section>
      <CopyField label="Invite link" value="https://example.com/invite/42" description="Anyone with the link can join." />
      <CopyField label="API key" value="sk_test_EXAMPLE0123456789" secret />
      <article>
        <h2 id="setup">Setup</h2>
        <p>
          Read <a href="/docs/start/">the start</a>.
        </p>
        <section className="demo" data-copy-ignore>
          <button type="button">Demo</button>
        </section>
      </article>
    </main>
  )
}

export default App
