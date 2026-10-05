import { describe, it, expect } from 'vitest';
import { scrubSensitiveRequestData } from './sentryScrub';

describe('scrubSensitiveRequestData', () => {
  it('removes the cookie, authorization and proxy-authorization headers (case-insensitively)', () => {
    const event = {
      request: {
        headers: {
          Cookie: 'sb-access-token=secret',
          Authorization: 'Bearer secret',
          'PROXY-AUTHORIZATION': 'Basic secret',
          'set-cookie': 'id=1',
          'content-type': 'application/json',
          'user-agent': 'test-agent',
        },
      },
    };

    scrubSensitiveRequestData(event);

    expect(event.request.headers).toEqual({
      'content-type': 'application/json',
      'user-agent': 'test-agent',
    });
  });

  it('removes request.cookies entirely', () => {
    const event = { request: { cookies: { session: 'secret' }, headers: {} } };

    scrubSensitiveRequestData(event);

    expect('cookies' in event.request).toBe(false);
  });

  it('does nothing when the event has no request', () => {
    const event = { message: 'boom' };
    expect(() => scrubSensitiveRequestData(event)).not.toThrow();
    expect(event).toEqual({ message: 'boom' });
  });

  it('does nothing when request.headers is absent', () => {
    const event = { request: { cookies: { a: '1' } } };
    scrubSensitiveRequestData(event);
    expect('cookies' in event.request).toBe(false);
  });

  it('tolerates a non-object request (never throws on malformed input)', () => {
    const event = { request: 'not-an-object' };
    expect(() => scrubSensitiveRequestData(event)).not.toThrow();
  });

  it('leaves every other header untouched', () => {
    const event = {
      request: {
        headers: { 'x-request-id': 'abc123', referer: 'https://chuyocode.test/' },
      },
    };

    scrubSensitiveRequestData(event);

    expect(event.request.headers).toEqual({
      'x-request-id': 'abc123',
      referer: 'https://chuyocode.test/',
    });
  });

  it("removes the visitor's IP address, email and username from event.user", () => {
    const event = {
      user: { id: 'user-1', ip_address: '203.0.113.7', email: 'a@b.test', username: 'ana' },
    };

    scrubSensitiveRequestData(event);

    expect(event.user).toEqual({ id: 'user-1' });
  });

  it('tolerates a missing or non-object user', () => {
    expect(() => scrubSensitiveRequestData({})).not.toThrow();
    expect(() => scrubSensitiveRequestData({ user: 'nope' })).not.toThrow();
  });
});
