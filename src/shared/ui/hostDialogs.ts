import { useSyncExternalStore } from "react";

/**
 * How many host dialogs are open. While one is, plugin frames turn `inert`, so a plugin can
 * neither click through nor draw focus away from it, and keybinds and typing to the composer
 * wait.
 */
let openDialogs = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Count a dialog as open until the returned function is called. */
export function trackOpenDialog(): () => void {
  openDialogs += 1;
  notify();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    openDialogs -= 1;
    notify();
  };
}

/** True while any host dialog is open. */
export function hostDialogOpen(): boolean {
  return openDialogs > 0;
}

export function subscribeHostDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while any host dialog is open. */
export function useHostDialogOpen(): boolean {
  return useSyncExternalStore(subscribeHostDialogs, hostDialogOpen);
}
