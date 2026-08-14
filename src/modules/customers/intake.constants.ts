/**
 * Intake values shared by the server and the browser.
 *
 * Its own file because the service that owns the rest of this flow is `server-only`, and the
 * dialog needs to tell staff how long a link lasts before the first one has been minted. A
 * client component importing the service would fail the build rather than the check.
 */

/** How long an invite link stays usable. Long enough to survive a weekend and a reminder. */
export const INTAKE_TTL_DAYS = 7;
