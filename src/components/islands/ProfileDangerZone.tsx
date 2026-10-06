/**
 * ProfileDangerZone — the Perfil page's "Zona de peligro" section (T3):
 * wraps `DeleteAccountDialog` with this page's own calm, outline-only
 * trigger (owner: the destructive red treatment "hurts the eye" sitting
 * directly in the user menu — this is the SAME dialog and copy, just a
 * quieter entry point, specifically chosen to read as calm until opened).
 *
 * A thin wrapper, not a straight prop pass-through from Astro markup,
 * because `renderTrigger` is a FUNCTION prop — fine between two React
 * components already inside the SAME hydrated island, never across the
 * Astro -> React boundary itself (see `DeleteAccountDialog`'s own header)
 * — so this island receives only the plain, serializable `lang` from Astro
 * and composes `DeleteAccountDialog` itself, entirely in React.
 */
import { UI_LABELS, type Lang } from '@/lib/i18n';
import DeleteAccountDialog from './DeleteAccountDialog';

export interface ProfileDangerZoneProps {
  lang: Lang;
}

export default function ProfileDangerZone({ lang }: ProfileDangerZoneProps) {
  const labels = UI_LABELS[lang].auth.userMenu;

  return (
    <DeleteAccountDialog
      lang={lang}
      labels={labels}
      renderTrigger={(onOpen) => (
        <button
          type="button"
          data-testid="profile-delete-account-trigger"
          onClick={onOpen}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/40 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          {labels.deleteAccount}
        </button>
      )}
    />
  );
}
