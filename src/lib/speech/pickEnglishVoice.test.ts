import { describe, expect, it } from 'vitest';
import { pickEnglishVoice, rankEnglishVoices, type VoiceLike } from './pickEnglishVoice';

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

  it('prefers en-US over en-GB and other English voices when quality is otherwise equal', () => {
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

  it('prefers the platform default voice when quality and accent are tied', () => {
    const plain = voice({ name: 'Plain', lang: 'en-US' });
    const marked = voice({ name: 'Plain', lang: 'en-US', default: true });
    expect(pickEnglishVoice([plain, marked])).toBe(marked);
  });

  it('prefers a network voice over an unnamed local one — natural-sounding voices are usually streamed, not shipped offline', () => {
    // This is a deliberate reversal of the OLD heuristic (which preferred
    // `localService: true` under the since-retired assumption that "offline"
    // meant "the more consistently natural one"). That assumption is exactly
    // the bug being fixed: it is what picked a robotic local voice over a
    // much better one available over the network.
    const remote = voice({ name: 'Remote', lang: 'en-US', localService: false });
    const local = voice({ name: 'Local', lang: 'en-US', localService: true });
    expect(pickEnglishVoice([remote, local])).toBe(remote);
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

  describe('quality tiers', () => {
    it('prefers a named neural/natural voice over a plain network voice', () => {
      const natural = voice({ name: 'Microsoft Aria Online (Natural)', lang: 'en-US', localService: false });
      const plainNetwork = voice({ name: 'Some Cloud Voice', lang: 'en-US', localService: false });
      expect(pickEnglishVoice([plainNetwork, natural])).toBe(natural);
    });

    it('prefers an Apple "(Enhanced)" voice over its own plain namesake', () => {
      const enhanced = voice({ name: 'Samantha (Enhanced)', lang: 'en-US', localService: true });
      const plain = voice({ name: 'Alex', lang: 'en-US', localService: true });
      expect(pickEnglishVoice([plain, enhanced])).toBe(enhanced);
    });

    it('avoids a known low-quality/novelty voice when a better one exists', () => {
      const david = voice({ name: 'Microsoft David Desktop - English (United States)', lang: 'en-US', localService: true, default: true });
      const natural = voice({ name: 'Microsoft Aria Online (Natural)', lang: 'en-US', localService: false });
      expect(pickEnglishVoice([david, natural])).toBe(natural);
    });

    it('still returns a known low-quality voice when it is the only one available', () => {
      const zira = voice({ name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US' });
      expect(pickEnglishVoice([zira])).toBe(zira);
    });

    it('does not mistake a coincidental substring for an avoided voice name', () => {
      // "Ralph" is on the avoid list; "Ralphie" must not match it as a substring.
      const ralphie = voice({ name: 'Ralphie', lang: 'en-US', localService: true });
      expect(pickEnglishVoice([ralphie])).toBe(ralphie);
    });
  });

  describe('options.voiceURI (explicit, remembered choice)', () => {
    it('honours an exact voiceURI match over quality/accent scoring entirely', () => {
      const natural = voice({ name: 'Microsoft Aria Online (Natural)', lang: 'en-US', voiceURI: 'aria' });
      const plain = voice({ name: 'Plain GB', lang: 'en-GB', voiceURI: 'plain-gb' });
      expect(pickEnglishVoice([natural, plain], undefined, { voiceURI: 'plain-gb' })).toBe(plain);
    });

    it('falls back to normal scoring when the remembered voiceURI is no longer available', () => {
      const natural = voice({ name: 'Microsoft Aria Online (Natural)', lang: 'en-US', voiceURI: 'aria' });
      expect(pickEnglishVoice([natural], undefined, { voiceURI: 'gone' })).toBe(natural);
    });
  });

  describe('options.accent (tie-breaker only)', () => {
    it('prefers en-GB over en-US when accent is GB and quality is tied', () => {
      const us = voice({ name: 'Plain', lang: 'en-US' });
      const gb = voice({ name: 'Plain', lang: 'en-GB' });
      expect(pickEnglishVoice([us, gb], undefined, { accent: 'GB' })).toBe(gb);
    });

    it('never lets an accent match override a real quality difference', () => {
      const mediocreUS = voice({ name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US' });
      const naturalGB = voice({ name: 'Microsoft Sonia Online (Natural)', lang: 'en-GB', localService: false });
      expect(pickEnglishVoice([mediocreUS, naturalGB], undefined, { accent: 'US' })).toBe(naturalGB);
    });
  });

  describe('realistic per-platform voice lists', () => {
    it('Edge/Windows: picks the Natural neural voice over the legacy desktop voices', () => {
      const voices: VoiceLike[] = [
        { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US', localService: true },
        { name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US', localService: true, default: true },
        { name: 'Microsoft Mark Desktop - English (United States)', lang: 'en-US', localService: true },
        { name: 'Microsoft Aria Online (Natural)', lang: 'en-US', localService: false },
        { name: 'Microsoft Guy Online (Natural)', lang: 'en-US', localService: false },
        { name: 'Microsoft Sonia Online (Natural)', lang: 'en-GB', localService: false },
      ];
      const picked = pickEnglishVoice(voices);
      expect(picked?.name).toBe('Microsoft Aria Online (Natural)');
    });

    it('Chrome/Windows: picks the named Google web voice over the bundled Microsoft desktop voices', () => {
      const voices: VoiceLike[] = [
        { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US', localService: true, default: true },
        { name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US', localService: true },
        { name: 'Google US English', lang: 'en-US', localService: false },
        { name: 'Google UK English Female', lang: 'en-GB', localService: false },
      ];
      const picked = pickEnglishVoice(voices);
      expect(picked?.name).toBe('Google US English');
    });

    it('Chrome/Android: picks the named Google voice over a generic local network voice', () => {
      const voices: VoiceLike[] = [
        { name: 'English (America)', lang: 'en-US', localService: false },
        { name: 'Google US English', lang: 'en-US', localService: false },
      ];
      const picked = pickEnglishVoice(voices);
      expect(picked?.name).toBe('Google US English');
    });

    it('Safari/macOS/iOS: picks the Enhanced Apple voice over the plain default', () => {
      const voices: VoiceLike[] = [
        { name: 'Samantha', lang: 'en-US', localService: true, default: true },
        { name: 'Samantha (Enhanced)', lang: 'en-US', localService: true },
        { name: 'Alex', lang: 'en-US', localService: true },
        { name: 'Bad News', lang: 'en-US', localService: true },
        { name: 'Zarvox', lang: 'en-US', localService: true },
        { name: 'Daniel', lang: 'en-GB', localService: true },
      ];
      const picked = pickEnglishVoice(voices);
      expect(picked?.name).toBe('Samantha (Enhanced)');
    });

    it('Firefox/Windows (no Enhanced/Natural voices shipped): picks a named-good voice over the legacy desktop ones', () => {
      const voices: VoiceLike[] = [
        { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US', localService: true, default: true },
        { name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US', localService: true },
        { name: 'Microsoft Hazel Desktop - English (Great Britain)', lang: 'en-GB', localService: true },
      ];
      // No neural/enhanced/named-good voice in this list at all: every
      // candidate falls through to a lower tier, but David/Zira are still
      // AVOIDED in favour of the unnamed-but-not-blacklisted Hazel voice.
      const picked = pickEnglishVoice(voices);
      expect(picked?.name).toBe('Microsoft Hazel Desktop - English (Great Britain)');
    });
  });
});

describe('rankEnglishVoices', () => {
  it('returns only English voices, best-scored first', () => {
    const es = voice({ name: 'Español', lang: 'es-ES' });
    const zira = voice({ name: 'Microsoft Zira Desktop - English (United States)', lang: 'en-US', localService: true });
    const natural = voice({ name: 'Microsoft Aria Online (Natural)', lang: 'en-US', localService: false });
    const ranked = rankEnglishVoices([es, zira, natural]);
    expect(ranked).toEqual([natural, zira]);
  });

  it('returns an empty array when there is no English voice', () => {
    expect(rankEnglishVoices([voice({ name: 'Español', lang: 'es-ES' })])).toEqual([]);
  });

  it('respects the accent option as the tie-breaker for ordering too', () => {
    const us = voice({ name: 'Plain', lang: 'en-US' });
    const gb = voice({ name: 'Plain', lang: 'en-GB' });
    expect(rankEnglishVoices([us, gb], { accent: 'GB' })).toEqual([gb, us]);
    expect(rankEnglishVoices([us, gb], { accent: 'US' })).toEqual([us, gb]);
  });
});
