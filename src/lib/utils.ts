import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `cn` — the shadcn/ui class combiner used by every generated component.
 *
 * Merges conditional class lists (clsx) and then resolves Tailwind class
 * conflicts (tailwind-merge), so the LAST utility of a conflicting pair wins
 * (e.g. `cn('px-2', 'px-4')` -> `px-4`). Keep this signature stable: shadcn
 * components import `{ cn }` from `@/lib/utils`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
