/**
 * ProfileNameForm — the "Nombre" section of the Perfil page (T3): edits the
 * signed-in visitor's own display name, stored server-side under a
 * dedicated metadata key the resolver prefers (`src/lib/profile.ts`'s
 * `DISPLAY_NAME_METADATA_KEY`) so a later Google re-sign-in can never
 * silently overwrite it — see that module's own header.
 *
 * Client-side validation mirrors the server's own `normalizeDisplayName`
 * (trim, collapse whitespace, 1-60 chars, no control characters) for nicer
 * UX only — `/api/cuenta/nombre.ts` re-validates independently and is the
 * actual authority, same "never trust the client alone" rule
 * `DeleteAccountDialog`'s own confirm-word check already follows.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { normalizeDisplayName } from '@/lib/displayName';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface ProfileNameFormProps {
  lang: Lang;
  /** The resolved display name at render time (`toProfile`'s own `name`, server-side). */
  initialName: string;
}

type Status = 'idle' | 'saving' | 'error';

export default function ProfileNameForm({ lang, initialName }: ProfileNameFormProps) {
  const t = UI_LABELS[lang].profile;
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const normalized = normalizeDisplayName(name);
    if (normalized === null) {
      setError(t.nameErrorInvalid);
      return;
    }
    setStatus('saving');
    setError(null);
    try {
      const res = await fetch('/api/cuenta/nombre', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: normalized }),
      });
      const body: { ok?: unknown; name?: unknown } = await res.json().catch(() => ({}));
      if (!res.ok || body.ok !== true) {
        setError(t.nameErrorGeneric);
        setStatus('error');
        return;
      }
      setName(typeof body.name === 'string' ? body.name : normalized);
      setStatus('idle');
      toast.success(t.nameSuccessToast);
    } catch {
      setError(t.nameErrorGeneric);
      setStatus('error');
    }
  }

  return (
    <form
      data-testid="profile-name-form"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={t.nameLabel} error={error ?? undefined}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            name="name"
            autoComplete="name"
            data-testid="profile-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            disabled={status === 'saving'}
          />
        )}
      </Field>
      <div>
        <Button
          type="submit"
          data-testid="profile-name-save"
          loading={status === 'saving'}
          disabled={status === 'saving'}
        >
          {status === 'saving' ? t.nameSaving : t.nameSaveButton}
        </Button>
      </div>
    </form>
  );
}
