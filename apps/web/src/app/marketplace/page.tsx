import { permanentRedirect } from "next/navigation";

/**
 * The arena was previously called the marketplace. Old links, bookmarks and
 * anything already shared keep working via a permanent (308) redirect, which
 * also tells search engines the canonical URL moved.
 */
export default function MarketplaceRedirect() {
  permanentRedirect("/arena");
}
