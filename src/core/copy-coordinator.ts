/**
 * A copy machine as seen by a coordinator. `release()` returns it from
 * `copied` to `idle`; it is a no-op in any other state.
 */
export interface CopyCoordinatorMember {
  readonly release: () => void;
}

/**
 * Makes a set of copy machines behave like one clipboard: when a member
 * succeeds, the member that previously showed "Copied" goes back to idle,
 * because the clipboard no longer holds its value.
 *
 * Failed copies never release anyone (the clipboard still holds the previous value).
 */
export interface CopyCoordinator {
  /** A member just reached `copied`. Releases the previous one. */
  readonly activate: (member: CopyCoordinatorMember) => void;
  /** A member left `copied` on its own (auto-reset, reset, unmount). */
  readonly deactivate: (member: CopyCoordinatorMember) => void;
  /** The member currently showing `copied`, if any. */
  readonly getActive: () => CopyCoordinatorMember | null;
}

export function createCopyCoordinator(): CopyCoordinator {
  let active: CopyCoordinatorMember | null = null;
  return {
    activate: (member) => {
      const previous = active;
      active = member;
      if (previous !== null && previous !== member) previous.release();
    },
    deactivate: (member) => {
      if (active === member) active = null;
    },
    getActive: () => active,
  };
}
