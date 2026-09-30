/**
 * CourseCreateForm — the "Nuevo curso" form on `/[lang]/admin/cursos`
 * (moderator-only, hidden Courses feature). Posts to `POST /api/admin/cursos`
 * and, on success, navigates to the new course's edit page — a real
 * navigation (`window.location.assign`), not client-side routing, mirroring
 * how the rest of the admin surfaces move between pages.
 *
 * Only serializable props (`lang`) cross the `client:load` boundary — no
 * function props, same rule every other island in this codebase follows.
 */
import { useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';

export interface CourseCreateFormProps {
  lang: Lang;
}

type Status = 'idle' | 'submitting';

export default function CourseCreateForm({ lang }: CourseCreateFormProps) {
  const t = UI_LABELS[lang].admin.cursos;
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setStatus('submitting');
    setError(null);
    try {
      const res = await fetch('/api/admin/cursos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim(), title: title.trim() }),
      });
      const body: { course?: { id: string }; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !body.course) {
        setError(body.error ?? 'db_error');
        setStatus('idle');
        return;
      }
      window.location.assign(`/${lang}/admin/cursos/${body.course.id}`);
    } catch {
      setError('db_error');
      setStatus('idle');
    }
  }

  const errors = t.errors as Record<string, string>;
  const errorMessage = error ? (errors[error] ?? errors.db_error) : null;

  return (
    <form
      onSubmit={(event) => {
        // The inline arrow keeps the event UNTYPED at the call site — see
        // `SignInForm.tsx`'s matching comment (React 19's types flag
        // `React.FormEvent<...>` as deprecated; inference off `onSubmit`
        // sidesteps it).
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
      data-testid="course-create-form"
    >
      <h2 className="text-lg font-semibold text-foreground">{t.createTitle}</h2>
      <Field label={t.fields.slug} required>
        {({ id }) => (
          <Input
            id={id}
            data-testid="course-create-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="react-basico"
            required
          />
        )}
      </Field>
      <Field label={t.fields.title} required>
        {({ id }) => (
          <Input
            id={id}
            data-testid="course-create-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        )}
      </Field>
      {errorMessage && (
        <p data-testid="course-create-error" className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
      <div>
        <Button type="submit" data-testid="course-create-submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? t.creating : t.createButton}
        </Button>
      </div>
    </form>
  );
}
