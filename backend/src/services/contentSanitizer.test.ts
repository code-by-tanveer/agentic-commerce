import { describe, expect, it } from 'vitest';
import { ContentSanitizer } from './contentSanitizer.js';

/**
 * Cycle 7: tests for the XML-function-call sanitizer.
 *
 * Coverage map (per cycle-7 task description):
 *  1. plain text passes through unchanged
 *  2. single function call across one chunk: stripped + parsed
 *  3. single function call split across multiple chunks
 *  4. two function calls in one stream
 *  5. malformed/unparseable XML: drop + reason, don't crash
 *  6. all four syntactic variants documented in the task
 */
describe('ContentSanitizer', () => {
  it('passes plain text through unchanged', () => {
    const s = new ContentSanitizer();
    const r1 = s.feed("Hello, here's a desk lamp suggestion.");
    expect(r1.safeText).toBe("Hello, here's a desk lamp suggestion.");
    expect(r1.foundCalls).toHaveLength(0);
    expect(r1.droppedReasons).toHaveLength(0);

    const r2 = s.feed(' Anything else?');
    expect(r2.safeText).toBe(' Anything else?');
    expect(r2.foundCalls).toHaveLength(0);

    const tail = s.flush();
    expect(tail.safeText).toBe('');
    expect(tail.droppedReasons).toHaveLength(0);
  });

  it('strips and parses a single function call delivered in one chunk', () => {
    const s = new ContentSanitizer();
    const r = s.feed(
      'sure thing <function(save_preference){"key":"budget","value":150}</function> done',
    );
    expect(r.safeText).toBe('sure thing  done');
    expect(r.foundCalls).toEqual([
      { name: 'save_preference', argsJson: '{"key":"budget","value":150}' },
    ]);
    expect(r.droppedReasons).toHaveLength(0);
  });

  it('strips and parses a function call split across multiple chunks', () => {
    const s = new ContentSanitizer();

    // Chunk 1: prelude + start of open tag.
    const r1 = s.feed('here you go <fun');
    expect(r1.safeText).toBe('here you go ');
    expect(r1.foundCalls).toHaveLength(0);

    // Chunk 2: completes the open tag + name + start of JSON.
    const r2 = s.feed('ction(search_catalog){"query":"de');
    expect(r2.safeText).toBe('');
    expect(r2.foundCalls).toHaveLength(0);

    // Chunk 3: rest of JSON.
    const r3 = s.feed('sk lamp"}');
    expect(r3.safeText).toBe('');
    expect(r3.foundCalls).toHaveLength(0);

    // Chunk 4: close tag + trailing text.
    const r4 = s.feed('</function> searching now.');
    expect(r4.safeText).toBe(' searching now.');
    expect(r4.foundCalls).toEqual([
      { name: 'search_catalog', argsJson: '{"query":"desk lamp"}' },
    ]);
    expect(r4.droppedReasons).toHaveLength(0);
  });

  it('recovers two function calls in one stream', () => {
    const s = new ContentSanitizer();
    const r = s.feed(
      '<function(save_preference){"key":"budget","value":{"max":150}}</function>' +
        'searching... ' +
        '<function(search_catalog){"query":"desk lamp","filters":{"price":{"max":150}}}</function>',
    );
    expect(r.safeText).toBe('searching... ');
    expect(r.foundCalls).toHaveLength(2);
    expect(r.foundCalls[0]).toEqual({
      name: 'save_preference',
      argsJson: '{"key":"budget","value":{"max":150}}',
    });
    expect(r.foundCalls[1]).toEqual({
      name: 'search_catalog',
      argsJson: '{"query":"desk lamp","filters":{"price":{"max":150}}}',
    });

    const tail = s.flush();
    expect(tail.safeText).toBe('');
    expect(tail.droppedReasons).toHaveLength(0);
  });

  it('drops malformed XML without crashing', () => {
    const s = new ContentSanitizer();
    // Unparseable: not valid JSON (missing closing brace, unterminated string).
    const r = s.feed(
      'oops <function(save_preference){"key":"budget","value": broken}</function> ok',
    );
    expect(r.safeText).toBe('oops  ok');
    expect(r.foundCalls).toHaveLength(0);
    expect(r.droppedReasons.length).toBeGreaterThan(0);
    expect(r.droppedReasons[0]).toMatch(/json|JSON|unbalanced/i);
  });

  it('drops a tag with no JSON args at all', () => {
    const s = new ContentSanitizer();
    const r = s.feed('hmm <function(noop)></function> then');
    expect(r.safeText).toBe('hmm  then');
    expect(r.foundCalls).toHaveLength(0);
    expect(r.droppedReasons.length).toBeGreaterThan(0);
  });

  it('drops an unclosed <function tag at end-of-stream via flush()', () => {
    const s = new ContentSanitizer();
    const r1 = s.feed('hi there <function(save_preference){"key":"budget"');
    // The opener landed; no close yet. Pre-open text was already emitted.
    expect(r1.safeText).toBe('hi there ');
    expect(r1.foundCalls).toHaveLength(0);
    expect(r1.droppedReasons).toHaveLength(0);

    // Stream ends without a close tag.
    const tail = s.flush();
    expect(tail.safeText).toBe('');
    expect(tail.droppedReasons.length).toBeGreaterThan(0);
    expect(tail.droppedReasons[0]).toMatch(/unclosed/);
  });

  describe('syntactic variants', () => {
    it('handles <function=name{json}</function> (equals form)', () => {
      const s = new ContentSanitizer();
      const r = s.feed('<function=save_preference{"key":"size","value":"M"}</function>');
      expect(r.safeText).toBe('');
      expect(r.foundCalls).toEqual([
        { name: 'save_preference', argsJson: '{"key":"size","value":"M"}' },
      ]);
    });

    it('handles <function(name){json}</function> (paren form)', () => {
      const s = new ContentSanitizer();
      const r = s.feed('<function(search_catalog){"query":"shoes"}</function>');
      expect(r.safeText).toBe('');
      expect(r.foundCalls).toEqual([
        { name: 'search_catalog', argsJson: '{"query":"shoes"}' },
      ]);
    });

    it('handles <function(name="name") {json}</function> (paren-quoted form)', () => {
      const s = new ContentSanitizer();
      const r = s.feed(
        '<function(name="search_catalog") {"query":"shoes"}</function>',
      );
      expect(r.safeText).toBe('');
      expect(r.foundCalls).toEqual([
        { name: 'search_catalog', argsJson: '{"query":"shoes"}' },
      ]);
    });

    it('handles <function name="name">{json}</function> (attribute form)', () => {
      const s = new ContentSanitizer();
      const r = s.feed(
        '<function name="search_catalog">{"query":"shoes"}</function>',
      );
      expect(r.safeText).toBe('');
      expect(r.foundCalls).toEqual([
        { name: 'search_catalog', argsJson: '{"query":"shoes"}' },
      ]);
    });
  });

  it('handles JSON with nested objects and quoted braces', () => {
    const s = new ContentSanitizer();
    // The args JSON contains a string literal with a `{` inside it, plus a
    // genuine nested object — the balanced-brace parser must skip the
    // brace-inside-string and only count structural braces.
    const r = s.feed(
      '<function(save_preference){"key":"note","value":"hello { world","extra":{"x":1}}</function>',
    );
    expect(r.safeText).toBe('');
    expect(r.foundCalls).toEqual([
      {
        name: 'save_preference',
        argsJson: '{"key":"note","value":"hello { world","extra":{"x":1}}',
      },
    ]);
  });

  it('does not emit a trailing partial-prefix of <function across chunks', () => {
    const s = new ContentSanitizer();
    // Critical case: chunk ends with `<` which COULD be the start of a future
    // `<function` tag. The sanitizer must hold the `<` back, not flush it.
    const r1 = s.feed('hello <');
    expect(r1.safeText).toBe('hello ');

    // Next chunk turns it into a different element (not a function call).
    // Once we see enough characters to know it's NOT `<function`, the held
    // text becomes safe to emit.
    const r2 = s.feed('br>world');
    expect(r2.safeText).toBe('<br>world');
  });
});
