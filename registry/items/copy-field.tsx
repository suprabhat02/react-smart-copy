"use client"

import * as React from "react"
import type { CopyError, CopyPayload } from "react-smart-copy"

import { CopyButton } from "@/components/copy-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface CopyFieldProps {
  /** Names the field, and its buttons ("Copy API key", "Show API key"). */
  label: string
  /** What is shown and copied. */
  value: string
  /**
   * An API key, a token or a password: shown as dots until revealed, and kept away from
   * password managers and autofill. Copying always copies the real value.
   */
  secret?: boolean | undefined
  /** Keeps the label for screen readers only. */
  hideLabel?: boolean | undefined
  /** A line under the field, linked to it for screen readers. */
  description?: React.ReactNode | undefined
  onCopied?: ((payload: CopyPayload) => void) | undefined
  onCopyError?: ((error: CopyError) => void) | undefined
  className?: string | undefined
}

/** A read-only value with a copy button: an invite link, an ID, or a secret kept hidden. */
function CopyField({
  label,
  value,
  secret = false,
  hideLabel = false,
  description,
  onCopied,
  onCopyError,
  className,
}: CopyFieldProps) {
  const id = React.useId()
  const [revealed, setRevealed] = React.useState(false)
  const hidden = secret && !revealed

  return (
    <div className={cn("grid gap-2", className)}>
      <label htmlFor={`${id}-value`} className={cn("text-sm font-medium", hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={`${id}-value`}
          readOnly
          value={value}
          type={hidden ? "password" : "text"}
          // A secret is not a password of this site: no saving, no autofill, no spell check.
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          aria-describedby={description ? `${id}-description` : undefined}
          className="font-mono"
          onFocus={(event) => {
            if (!hidden) event.currentTarget.select()
          }}
        />
        {secret ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Show ${label}`}
            aria-pressed={revealed}
            onClick={() => {
              setRevealed((shown) => !shown)
            }}
          >
            <EyeIcon open={!revealed} />
          </Button>
        ) : null}
        <CopyButton
          value={value}
          label={`Copy ${label}`}
          variant="outline"
          onCopied={onCopied}
          onCopyError={onCopyError}
        />
      </div>
      {description ? (
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {open ? null : <path d="m3 3 18 18" />}
    </svg>
  )
}

export { CopyField }
