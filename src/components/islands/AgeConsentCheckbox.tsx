/**
 * AgeConsentCheckbox — the Ley N° 29733 minors'-data consent sentence + its
 * checkbox (`@lib/ageConsent`), shared verbatim between the sign-up form
 * (`PasswordAuthForm`'s sign-up mode) and the standalone consent screen
 * (`ConsentForm`) so the owner-approved wording and its two legal links live
 * in exactly one place.
 *
 * Presentational and fully controlled: no state, no submit handling — each
 * caller owns `checked`/`onChange` and decides what submitting means. Copy
 * comes from `UI_LABELS[lang].auth.consent` (read directly, same precedent as
 * `UserMenu`'s own labels) rather than a local COPY map, because this exact
 * sentence is shared by two different islands and is legally significant —
 * one source of truth beats two drifting copies.
 */
import { UI_LABELS, type Lang } from '@lib/i18n';
import { Checkbox } from '@/components/ui/checkbox';

/** Resolve a `Lang` from an arbitrary prop string, defaulting to Spanish — same rule as `PasswordAuthForm`'s `copyFor`. */
function uiLang(lang: string): Lang {
  return lang === 'en' ? 'en' : 'es';
}

export interface AgeConsentCheckboxProps {
  /** Locale for the sentence/links. */
  lang: string;
  /** `id` the associated `<label>` points at. */
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'data-testid'?: string;
}

export default function AgeConsentCheckbox({
  lang,
  id,
  checked,
  onChange,
  disabled,
  'data-testid': testId,
}: AgeConsentCheckboxProps) {
  const t = UI_LABELS[uiLang(lang)].auth.consent;
  // `sentence` carries two markers, `{terms}` and `{privacy}`, replaced here
  // with the two embedded links — never rendered as literal text.
  const [before, afterTerms] = t.sentence.split('{terms}');
  const [middle, after] = afterTerms.split('{privacy}');

  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        disabled={disabled}
        data-testid={testId}
        className="mt-0.5"
      />
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {before}
        <a
          href={`/${lang}/legal/terms`}
          className="text-accent hover:text-accent-hover hover:underline"
        >
          {t.termsLinkText}
        </a>
        {middle}
        <a
          href={`/${lang}/legal/privacy`}
          className="text-accent hover:text-accent-hover hover:underline"
        >
          {t.privacyLinkText}
        </a>
        {after}
      </label>
    </div>
  );
}
