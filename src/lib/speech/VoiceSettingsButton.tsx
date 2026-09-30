/**
 * VoiceSettingsButton — the accent + voice picker popover mounted next to
 * the primary `SpeakButton` ("Better English voice" — the owner reported
 * the default browser voice sounds bad; paid neural TTS is out of scope, so
 * this lets the learner pick the best ALREADY-INSTALLED voice instead).
 *
 * Persists `{ accent, voiceURI }` via `voicePreferenceStore`. Every
 * `useSpeech()` instance on the page — every `SpeakButton`, anywhere, not
 * just the one this popover is mounted beside — picks up a saved choice
 * instantly (the store's own `storage`/in-page event), without needing to
 * know this popover exists.
 *
 * RENDERS NOTHING when `speechSynthesis` is unsupported, same rule every
 * other file in this module follows.
 *
 * Copy is a LOCAL map, not `UI_LABELS` — same reasoning as `SpeakButton`'s
 * own header: this component is reachable from BOTH the `ExerciseIsland`/
 * mechanics tree (which deliberately keeps the Astro-side i18n module out of
 * its bundle) and the activities tree — staying local keeps it usable,
 * byte-identically, from either one.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { GearIcon } from '@phosphor-icons/react/dist/ssr/Gear';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { pickEnglishVoice, rankEnglishVoices, type VoiceLike } from './pickEnglishVoice';
import { useSpeechVoices } from './useSpeechVoices';
import { useVoicePreference, type VoicePreference } from './voicePreferenceStore';
import { useSpeech } from './useSpeech';

/** Always English, regardless of the popover's own chrome locale — demonstrates an ENGLISH voice. */
const SAMPLE_TEXT = 'This is what this voice sounds like.';

interface Copy {
  title: string;
  trigger: string;
  accentLabel: string;
  accentUS: string;
  accentUK: string;
  voiceLabel: string;
  recommended: string;
  noVoices: string;
  test: string;
}

/**
 * REGISTER (standing project rule): neutral Spanish, no voseo — see
 * `SpeakButton.COPY`'s own note. Exported for the same reason that map is:
 * so a neutral-Spanish guard test can read it.
 */
export const COPY: Record<'es' | 'en', Copy> = {
  es: {
    title: 'Ajustes de voz',
    trigger: 'Ajustes de voz',
    accentLabel: 'Acento',
    accentUS: 'EE. UU.',
    accentUK: 'Reino Unido',
    voiceLabel: 'Voz',
    recommended: 'Recomendada',
    noVoices: 'No hay voces en inglés instaladas en este dispositivo.',
    test: 'Probar',
  },
  en: {
    title: 'Voice settings',
    trigger: 'Voice settings',
    accentLabel: 'Accent',
    accentUS: 'US',
    accentUK: 'UK',
    voiceLabel: 'Voice',
    recommended: 'Recommended',
    noVoices: 'No English voices are installed on this device.',
    test: 'Test',
  },
};

/** Resolve copy for a locale, defaulting to English — same rule every local COPY map in this codebase follows. */
function copyFor(lang: string | undefined): Copy {
  return lang === 'es' ? COPY.es : COPY.en;
}

/** The voice the effective preference resolves to, for the Select's own `value` — same resolution `useSpeech` itself applies (explicit `voiceURI`, falling back to the best-scored voice for `accent`). */
function resolveEffectiveVoice(voices: VoiceLike[], preference: VoicePreference): VoiceLike | null {
  return pickEnglishVoice(voices, undefined, {
    accent: preference.accent,
    voiceURI: preference.voiceURI ?? undefined,
  });
}

export interface VoiceSettingsButtonProps {
  /** Active locale, for this popover's own chrome copy only. */
  lang?: string;
  className?: string;
}

/** Trigger sizing mirrors `SpeakButton`'s own `NORMAL_SIZE` so the gear icon lines up with the speaker icon it sits beside. */
const TRIGGER_SIZE = 'h-11 w-11 sm:h-8 sm:w-8';

export default function VoiceSettingsButton({ lang, className }: VoiceSettingsButtonProps) {
  const { supported, voices } = useSpeechVoices();
  const [preference, setPreference] = useVoicePreference();
  const { speak } = useSpeech();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  if (!supported) return null;

  const t = copyFor(lang);
  const ranked = rankEnglishVoices(voices, { accent: preference.accent });
  const effectiveVoiceURI = resolveEffectiveVoice(voices, preference)?.voiceURI ?? '';

  function setAccent(accent: VoicePreference['accent']) {
    setPreference({ ...preference, accent });
  }

  function setVoiceURI(voiceURI: string) {
    setPreference({ ...preference, voiceURI: voiceURI || null });
  }

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        data-testid="voice-settings-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t.trigger}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          TRIGGER_SIZE,
        )}
      >
        <GearIcon aria-hidden="true" />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t.title}
          data-testid="voice-settings-panel"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl bg-popover p-3 text-sm text-popover-foreground ring-1 ring-foreground/10 shadow-lg"
        >
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.accentLabel}</p>
          <div className="mb-3 flex gap-1.5">
            <Button
              type="button"
              variant={preference.accent === 'US' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={preference.accent === 'US'}
              onClick={() => setAccent('US')}
              className="flex-1"
            >
              {t.accentUS}
            </Button>
            <Button
              type="button"
              variant={preference.accent === 'GB' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={preference.accent === 'GB'}
              onClick={() => setAccent('GB')}
              className="flex-1"
            >
              {t.accentUK}
            </Button>
          </div>

          {ranked.length > 0 ? (
            <>
              <label className="mb-1 block text-xs font-semibold tracking-wide text-muted-foreground uppercase" htmlFor={`${panelId}-voice`}>
                {t.voiceLabel}
              </label>
              <Select
                id={`${panelId}-voice`}
                data-testid="voice-settings-select"
                fieldSize="sm"
                wrapperClassName="mb-3"
                value={effectiveVoiceURI}
                onChange={(event) => setVoiceURI(event.target.value)}
              >
                {ranked.map((voice, index) => (
                  <option key={voice.voiceURI ?? voice.name} value={voice.voiceURI ?? ''}>
                    {index === 0 ? `${voice.name} (${t.recommended})` : voice.name}
                  </option>
                ))}
              </Select>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="voice-settings-test"
                onClick={() => speak(SAMPLE_TEXT)}
                className="w-full"
              >
                {t.test}
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t.noVoices}</p>
          )}
        </div>
      )}
    </div>
  );
}
