// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  isEmbeddedWindowDom,
  postDeskWindowMessage,
  isDeskWindowMessageEnvelope,
  DESK_WINDOW_EMBEDDED_ATTR,
  DESK_WINDOW_MESSAGE_SOURCE,
} from './deskWindowMessaging';

describe('isEmbeddedWindowDom', () => {
  it('is false when the attribute is absent', () => {
    const doc = { documentElement: document.createElement('html') };
    expect(isEmbeddedWindowDom(doc)).toBe(false);
  });

  it('is true when BaseLayout rendered the embedded marker', () => {
    const html = document.createElement('html');
    html.setAttribute(DESK_WINDOW_EMBEDDED_ATTR, '');
    expect(isEmbeddedWindowDom({ documentElement: html })).toBe(true);
  });
});

describe('postDeskWindowMessage', () => {
  function fakeWin(parent: unknown) {
    return { parent, location: { origin: 'https://example.test' } } as unknown as Window;
  }

  it('posts the envelope (tagged with source) to a real parent, at this origin', () => {
    const posted: Array<{ message: unknown; origin: string }> = [];
    const parent = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
    postDeskWindowMessage(fakeWin(parent), { type: 'minimize' });

    expect(posted).toEqual([{ message: { source: DESK_WINDOW_MESSAGE_SOURCE, type: 'minimize' }, origin: 'https://example.test' }]);
  });

  it('is a no-op when there is no parent frame at all (win.parent === win)', () => {
    let called = false;
    const win = {} as unknown as Window;
    (win as unknown as { parent: unknown }).parent = win;
    (win as unknown as { location: unknown }).location = { origin: 'https://example.test' };
    const originalPostMessage = window.postMessage;
    window.postMessage = () => {
      called = true;
    };
    postDeskWindowMessage(win, { type: 'close' });
    window.postMessage = originalPostMessage;
    expect(called).toBe(false);
  });

  it('never throws when postMessage itself throws', () => {
    const parent = {
      postMessage: () => {
        throw new Error('blocked');
      },
    };
    expect(() => postDeskWindowMessage(fakeWin(parent), { type: 'close' })).not.toThrow();
  });
});

describe('isDeskWindowMessageEnvelope', () => {
  it('accepts a correctly tagged envelope', () => {
    expect(isDeskWindowMessageEnvelope({ source: DESK_WINDOW_MESSAGE_SOURCE, type: 'close' })).toBe(true);
  });

  it('rejects anything untagged or malformed', () => {
    expect(isDeskWindowMessageEnvelope(null)).toBe(false);
    expect(isDeskWindowMessageEnvelope('close')).toBe(false);
    expect(isDeskWindowMessageEnvelope({ type: 'close' })).toBe(false);
    expect(isDeskWindowMessageEnvelope({ source: 'something-else', type: 'close' })).toBe(false);
    expect(isDeskWindowMessageEnvelope({ source: DESK_WINDOW_MESSAGE_SOURCE })).toBe(false);
  });
});
