/**
 * Skip link. Visually hidden until focused, it's the first thing a keyboard or
 * screen-reader user lands on, letting them jump past the header nav straight to
 * the page content (the `#main-content` wrapper in the root layout).
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-md bg-rival px-4 py-2 text-sm font-medium text-rival-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus-visible:focus-ring"
    >
      Skip to content
    </a>
  );
}
