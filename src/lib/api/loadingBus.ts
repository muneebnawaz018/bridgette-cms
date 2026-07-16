'use client';

/**
 * Tiny global counter of in-flight mutating requests (POST/PATCH/DELETE via the api
 * client). A provider subscribes and shows the branded full-screen loader whenever
 * anything is in flight. GET/SWR reads are deliberately excluded so background
 * revalidation never flashes the overlay.
 */
type Listener = (active: boolean) => void;

let count = 0;
const listeners = new Set<Listener>();

function emit() {
  const active = count > 0;
  for (const l of listeners) l(active);
}

export const loadingBus = {
  begin() {
    count += 1;
    if (count === 1) emit();
  },
  end() {
    count = Math.max(0, count - 1);
    if (count === 0) emit();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  isActive() {
    return count > 0;
  },
};
