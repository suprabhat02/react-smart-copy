"use client"

import { escapeMarkdown, htmlToMarkdown } from "react-smart-copy/markdown"

import { CopyButton, type CopyButtonProps } from "@/components/copy-button"

export interface CopyPageButtonProps extends Omit<CopyButtonProps, "value"> {
  /** The element holding the page's text. By default the page's `<article>`, else its `<main>`. */
  selector?: string | undefined
  /** Elements to leave out: demos, ads, feedback widgets. `[data-copy-ignore]` always is. */
  ignore?: string | undefined
  /**
   * The page's title, written as the first heading. By default the page's `<h1>`, when it is
   * outside the copied element (inside it, it is copied anyway).
   */
  title?: string | undefined
}

/**
 * Copies the page as Markdown, to paste into a chat, an issue or an editor. Heading permalinks,
 * buttons, forms and hidden elements are left out, and links stay absolute.
 */
function CopyPageButton({
  selector,
  ignore,
  title,
  label = "Copy page as Markdown",
  children = "Copy page",
  variant = "outline",
  size = "sm",
  ...props
}: CopyPageButtonProps) {
  return (
    <CopyButton
      {...props}
      label={label}
      variant={variant}
      size={size}
      // Converted during the click, so Safari still counts the write as the user's action.
      value={() => {
        // A selector you give is used alone: no fallback copying something else.
        const root = selector
          ? document.querySelector(selector)
          : (document.querySelector("article") ?? document.querySelector("main"))
        // Nothing to copy: the button shows why, rather than reporting an empty page as copied.
        if (root === null) return ""
        const { markdown } = htmlToMarkdown(root, {
          ...(ignore ? { ignore } : {}),
          baseUrl: window.location.href,
        })
        if (markdown === "") return ""
        // The page's <h1>, unless the copied element has its own (it is in the Markdown already).
        const pageHeading = root.querySelector("h1") ? null : document.querySelector("h1")
        const heading = title ?? (pageHeading ? pageHeading.textContent : null)?.trim()
        return heading ? `# ${escapeMarkdown(heading)}\n\n${markdown}\n` : `${markdown}\n`
      }}
    >
      {children}
    </CopyButton>
  )
}

export { CopyPageButton }
