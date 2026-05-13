import { NextResponse, type NextRequest } from 'next/server';

// Cycle 6 — nonce-based Content-Security-Policy middleware.
//
// Why: prior to this cycle the FE relied on `'unsafe-inline'` (and in dev
// `'unsafe-eval'`) for scripts, which is the Tier-2 CSP posture and was
// flagged by the Cycle 5 security review. With Next 14's app-router we can
// issue a per-request nonce, forward it to the React tree via a request
// header, and tighten the script-src to `'self' 'nonce-<x>'` in production.
//
// How: this middleware runs on every page request. We generate a fresh
// nonce (`crypto.randomUUID()` with dashes stripped; CSP only requires that
// nonces be unpredictable per response, not specifically base64 — UUIDv4 is
// fine), inject it as the `x-nonce` request header (so server components
// can read it via `headers().get('x-nonce')` and stamp `<script nonce>`),
// and write the assembled CSP onto the response.
//
// Dev caveat: Next.js dev server needs `'unsafe-eval'` for React Refresh
// and `'unsafe-inline'` for the inline runtime script that bootstraps HMR.
// We keep both in development; production drops them.

const PROD = process.env.NODE_ENV === 'production';

function buildCsp(nonce: string): string {
  const scriptSrc = PROD
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`;
  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`, // Tailwind injects per-class styles via <style>; can't easily nonce these.
    `img-src 'self' https: data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' https:`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `form-action 'self'`,
  ].join('; ');
}

export function middleware(request: NextRequest) {
  // `crypto.randomUUID` is available on the Edge runtime where Next
  // middleware executes. UUIDv4 is unpredictable enough to serve as a CSP
  // nonce; we strip the dashes purely for compactness in the header.
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = buildCsp(nonce);

  // Forward the nonce to the server-rendered tree via a request header.
  // Server components can read it with `headers().get('x-nonce')`. Next
  // also reads `x-nonce` automatically and applies it to its built-in
  // bootstrap script tags, so HMR and the framework's own inline scripts
  // pass CSP without any additional wiring.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Pass the assembled policy to the framework as well so Next can
  // dedupe and place it correctly (per Next's CSP docs).
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('content-security-policy', csp);
  return response;
}

// Skip CSP injection for static assets, image optimizer, prefetched data,
// and favicon — those don't render HTML so a header is just wasted bytes,
// and `/api/*` is the rewrite path to the backend (the backend sets its
// own headers there).
export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
