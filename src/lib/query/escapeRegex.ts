/**
 * Neutralise regex metacharacters so user input can be used as a literal substring match.
 *
 * Two problems this avoids. A search for "a+b" or "(" is a syntax error and throws, which
 * turns a normal search box into a 500. Worse, a crafted pattern such as `(a+)+$` can make
 * the engine backtrack catastrophically, so a single search request burns server CPU for as
 * long as it is allowed to run. Anything that reaches `new RegExp` from a request must come
 * through here first.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
