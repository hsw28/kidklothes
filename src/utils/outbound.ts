/**
 * Central outbound URL hook.
 *
 * Future affiliate integration can be added here without touching UI code:
 * - Skimlinks/Sovrn redirect wrapping
 * - Direct merchant parameter rewriting (subid/campaign/source tags)
 * - Per-domain allowlist/blocklist and attribution policy
 */
export const buildOutboundUrl = (url: string): string => {
  return url;
};
