import type { ReactNode } from 'react';

/*
 * Auth pages (login, forgot, set/reset password) are for signed-OUT visitors, and this layout
 * deliberately does nothing.
 *
 * It used to read the session here and bounce a signed-in visitor to the dashboard. Reading a
 * cookie makes the whole route dynamic, and a dynamic route in Next streams its metadata after
 * the shell has flushed, which lands the title and description in the body rather than the head.
 * That cost the one public page in this app its description as far as any crawler that reads the
 * document rather than the rendered DOM is concerned.
 *
 * The redirect now lives in the middleware, which sees the same cookies one hop earlier and
 * never has to render anything to decide. See src/middleware.ts.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
