import { describe, expect, it } from 'vitest';
import { signUploadUrl, verifyUploadUrl } from './uploads.js';

// Architect Top-5 #3 — signed upload URL is the SSRF gate for the vision
// pipeline (ARCH §7). These cases assert the gate's fitness: round-trip,
// tamper-resistance, expiry, traversal refusal, and scheme/format guards.

const HOUR_MS = 60 * 60 * 1000;

describe('signUploadUrl / verifyUploadUrl', () => {
  it('round-trips a fresh signature (truthy + filename preserved)', () => {
    const url = signUploadUrl('abc.png', HOUR_MS);
    const v = verifyUploadUrl(url);
    expect(v).toBeTruthy();
    expect(v?.filename).toBe('abc.png');
  });

  it('rejects a tampered HMAC (flip a char in the signature)', () => {
    const url = signUploadUrl('abc.png', HOUR_MS);
    // Format: `signed:<payload>.<mac>` — mutate the last char of the MAC.
    const last = url.slice(-1);
    const flipped = last === 'A' ? 'B' : 'A';
    const tampered = url.slice(0, -1) + flipped;
    expect(verifyUploadUrl(tampered)).toBeNull();
  });

  it('rejects an expired signature (ttlMs in the past)', async () => {
    // Sign with a 1-ms TTL, then yield to the event loop so `Date.now()`
    // advances past `exp` before we verify.
    const url = signUploadUrl('abc.png', 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(verifyUploadUrl(url)).toBeNull();
  });

  it("refuses path-traversal filenames at sign time ('../etc/passwd', 'foo/bar.png', '..\\\\evil.png')", () => {
    // signUploadUrl throws on any filename containing a path separator
    // (defensive — even though the HMAC would still bind the filename).
    expect(() => signUploadUrl('../etc/passwd', HOUR_MS)).toThrow();
    expect(() => signUploadUrl('foo/bar.png', HOUR_MS)).toThrow();
    expect(() => signUploadUrl('..\\evil.png', HOUR_MS)).toThrow();
  });

  it('returns null for URLs that do not start with the `signed:` scheme', () => {
    expect(verifyUploadUrl('https://example.com/img.png')).toBeNull();
    expect(verifyUploadUrl('file:///etc/passwd')).toBeNull();
  });

  it('returns null for an empty URL string', () => {
    expect(verifyUploadUrl('')).toBeNull();
  });

  it('returns null for a non-string URL (null cast)', () => {
    // verifyUploadUrl typeguards via `typeof url !== 'string'` before .slice().
    expect(verifyUploadUrl(null as unknown as string)).toBeNull();
  });
});
