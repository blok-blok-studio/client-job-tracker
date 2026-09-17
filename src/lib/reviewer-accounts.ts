/**
 * Logins handed to platform review teams (Meta App Review, YouTube API
 * Services audit). A reviewer can't be expected to enrol an authenticator, so
 * these accounts skip the mandatory two-factor screen. Everyone else keeps it.
 *
 * The list lives in code on purpose: no API or Team-page edit can add an
 * address to it, and the exemption only holds while the account is still a
 * MEMBER limited to the Content tab. Widen its access and the gate comes back.
 *
 * When a review ends, deactivate the account (User.isActive = false).
 */
export const REVIEWER_EMAILS = ["appreview@blokblokstudio.com", "ytreview@blokblokstudio.com"] as const;

const REVIEWER_PAGES = ["content"];

export function isReviewerAccount(user: { email: string; role: string; allowedPages: string[] }): boolean {
  if (!(REVIEWER_EMAILS as readonly string[]).includes(user.email.toLowerCase())) return false;
  if (user.role !== "MEMBER") return false;
  return user.allowedPages.length > 0 && user.allowedPages.every((page) => REVIEWER_PAGES.includes(page));
}
