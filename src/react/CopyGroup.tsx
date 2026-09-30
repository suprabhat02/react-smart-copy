import { createContext, useContext, useState, type ReactNode } from 'react';
import { createCopyCoordinator, type CopyCoordinator } from '../core/copy-coordinator';

const CopyGroupContext = /* @__PURE__ */ createContext<CopyCoordinator | null>(null);

export interface CopyGroupProps {
  readonly children?: ReactNode;
  /**
   * Share a coordinator with code outside this tree (another root, a vanilla
   * `createCopyMachine`). Defaults to one owned by this group.
   */
  readonly coordinator?: CopyCoordinator;
}

/**
 * Every `useCopy` / `<CopyField.Root>` inside behaves like one clipboard:
 * a new successful copy returns the previously "Copied" one to idle.
 * Opt a single field out with `copyOptions={{ coordinator: null }}`. Groups nest; the nearest wins.
 */
export function CopyGroup({ children, coordinator }: CopyGroupProps) {
  const [owned] = useState(createCopyCoordinator);
  return <CopyGroupContext.Provider value={coordinator ?? owned}>{children}</CopyGroupContext.Provider>;
}

/** The nearest `<CopyGroup>`'s coordinator, or `null` outside any group. */
export function useCopyGroup(): CopyCoordinator | null {
  return useContext(CopyGroupContext);
}
