import { describe, expect, it } from 'vitest';
import { pickEnglishVoice, type VoiceLike } from './pickEnglishVoice';

function voice(overrides: Partial<VoiceLike> = {}): VoiceLike {
  return { name: 'Voice', lang: 'en-US', ...overrides };
}

describe('pickEnglishVoice', () => {
  it('returns null when there are no voices at all', () => {
    expect(pickEnglishVoice([])).toBeNull();
  });

  it('returns null when no voice is English', () => {
    const voices = [voice({ name: 'Español', lang: 'es-ES' }), voice({ name: 'Français', lang: 'fr-FR' })];
    expect(pickEnglishVoice(voices)).toBeNull();
  });

  it('prefers en-US over en-GB and other English voices', () => {
    const us = voice({ name: 'US', lang: 'en-US' });
    const gb = voice({ name: 'GB', lang: 'en-GB' });
    const au = voice({ name: 'AU', lang: 'en-AU' });
    expect(pickEnglishVoice([au, gb, us])).toBe(us);
  });

  it('falls back to en-GB when there is no en-US voice', () => {
    const gb = voice({ name: 'GB', lang: 'en-GB' });
    const au = voice({ name: 'AU', lang: 'en-AU' });
    expect(pickEnglishVoice([au, gb])).toBe(gb);
  });

  it('falls back to any en-* voice when neither en-US nor en-GB exists', () => {
    const au = voice({ name: 'AU', lang: 'en-AU' });
    const ie = voice({ name: 'IE', lang: 'en-IE' });
    const result = pickEnglishVoice([au, ie]);
    expect(result).not.toBeNull();
    expect(result!.lang.toLowerCase().startsWith('en')).toBe(true);
  });

  it('matches language case-insensitively', () => {
    const us = voice({ name: 'US', lang: 'EN-us' });
    expect(pickEnglishVoice([us])).toBe(us);
  });

  it('prefers the platform default voice within a tier', () => {
    const plain = voice({ name: 'Plain', lang: 'en-US' });
    const marked = voice({ name: 'Default', lang: 'en-US', default: true });
    expect(pickEnglishVoice([plain, marked])).toBe(marked);
  });

  it('prefers a local (offline) voice over a remote one when neither is the default', () => {
    const remote = voice({ name: 'Remote', lang: 'en-US', localService: false });
    const local = voice({ name: 'Local', lang: 'en-US', localService: true });
    expect(pickEnglishVoice([remote, local])).toBe(local);
  });

  it('honours an exact preferredLang match over the default tier order', () => {
    const us = voice({ name: 'US', lang: 'en-US' });
    const ie = voice({ name: 'IE', lang: 'en-IE' });
    expect(pickEnglishVoice([us, ie], 'en-IE')).toBe(ie);
  });

  it('falls back to the default order when preferredLang matches nothing', () => {
    const us = voice({ name: 'US', lang: 'en-US' });
    expect(pickEnglishVoice([us], 'en-NZ')).toBe(us);
  });
});
