"use client"

import * as React from "react"
import {
  describeCopyError,
  LiveRegion,
  useCopy,
  type CopyError,
  type CopyPayload,
  type CopySource,
} from "react-smart-copy"

import { Button } from "@/components/ui/button"

type ButtonProps = React.ComponentProps<typeof Button>

export interface CopyButtonProps
  extends Omit<ButtonProps, "value" | "onClick" | "onCopy" | "onError" | "asChild" | "render" | "children"> {
  /** Visible text beside the icon. Without it, the button is icon only. */
  children?: React.ReactNode | undefined
  /**
   * What to copy: text, a payload (`{ kind: "html", html, text }`, JSON, an image), or a
   * function that returns one, run during the click (it may return a promise).
   */
  value: CopySource
  /**
   * The name of an icon-only button, which never changes. Default "Copy". With visible text
   * (children), the text is the name, as speech-input users say it, and this is the tooltip.
   */
  label?: string | undefined
  /** Announced to screen readers after a copy. Default "Copied". */
  copiedMessage?: string | undefined
  /** After a copy, how long the check mark shows. Default 2000 ms. */
  resetAfterMs?: number | undefined
  onCopied?: ((payload: CopyPayload) => void) | undefined
  onCopyError?: ((error: CopyError) => void) | undefined
}

/**
 * A copy button: a check mark when copied, a warning with the reason when not, and both
 * announced to screen readers. Icon only by default; children add visible text.
 */
function CopyButton({
  value,
  label = "Copy",
  copiedMessage = "Copied",
  resetAfterMs = 2000,
  onCopied,
  onCopyError,
  variant = "ghost",
  size,
  className,
  children,
  ...props
}: CopyButtonProps) {
  const { copy, status, error } = useCopy({
    resetAfterMs,
    onCopy: (payload) => onCopied?.(payload),
    onError: (copyError) => onCopyError?.(copyError),
  })
  const reason = error ? describeCopyError(error) : undefined
  const message = status === "copied" ? copiedMessage : (reason ?? "")

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size ?? (children ? "default" : "icon")}
        aria-label={children ? undefined : label}
        aria-busy={status === "copying" || undefined}
        data-status={status}
        className={className}
        onClick={() => void copy(value)}
        {...props}
      >
        {/* The tooltip says why a copy failed. On this span, not the button: some bases'
            buttons (React Aria) take no title. */}
        <span title={reason ?? label} className="contents">
          <CopyStatusIcon status={status} />
          {children}
        </span>
      </Button>
      <LiveRegion message={message} />
    </>
  )
}

function CopyStatusIcon({ status }: { status: string }) {
  const common = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  }
  if (status === "copied") {
    return (
      <svg {...common} data-icon="copied">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    )
  }
  if (status === "error") {
    return (
      <svg {...common} data-icon="error">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    )
  }
  return (
    <svg {...common} data-icon="copy">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export { CopyButton }
