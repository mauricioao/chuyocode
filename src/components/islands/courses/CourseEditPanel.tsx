/**
 * CourseEditPanel — `/[lang]/admin/cursos/[id]` (moderator-only, hidden
 * Courses feature). Three independent surfaces in one island because they
 * share the same page and the same `courseId`, not because they share state:
 * the fields form (`POST .../actualizar`), the status buttons
 * (`POST .../estado`), and the access grant panel
 * (`POST .../acceso/otorgar` / `POST .../acceso/[userId]/revocar`).
 *
 * Only serializable props cross the `client:load` boundary (`initialCourse`,
 * `initialOwners`, `initialModules`) — no function props, same rule every
 * other island here follows. Module/lesson authoring itself lives in
 * `ModuleManager` (a plain child component, not its own island).
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import ModuleManager, { type ModuleRecord } from './ModuleManager';

export type CourseStatus = 'draft' | 'published' | 'archived';

export interface EditableCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  level: string | null;
  status: CourseStatus;
  included_in_premium: boolean;
  price_cents: number | null;
  currency: string;
}

export interface CourseOwner {
  userId: string;
  email: string | null;
  source: 'purchase' | 'grant' | 'promo';
  createdAt: string;
}

export interface CourseEditPanelProps {
  lang: Lang;
  initialCourse: EditableCourse;
  initialOwners: CourseOwner[];
  initialModules: ModuleRecord[];
}

const LEVELS = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export default function CourseEditPanel({ lang, initialCourse, initialOwners, initialModules }: CourseEditPanelProps) {
  const t = UI_LABELS[lang].admin.cursos;
  const errors = t.errors as Record<string, string>;
  const errorMessage = (key: string | null) => (key ? (errors[key] ?? errors.db_error) : null);

  const [course, setCourse] = useState(initialCourse);
  const [title, setTitle] = useState(initialCourse.title);
  const [subtitle, setSubtitle] = useState(initialCourse.subtitle ?? '');
  const [description, setDescription] = useState(initialCourse.description ?? '');
  const [level, setLevel] = useState(initialCourse.level ?? '');
  const [includedInPremium, setIncludedInPremium] = useState(initialCourse.included_in_premium);
  const [priceCents, setPriceCents] = useState(
    initialCourse.price_cents != null ? String(initialCourse.price_cents) : '',
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);

  const [owners, setOwners] = useState(initialOwners);
  const [grantEmail, setGrantEmail] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);

  async function saveFields() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/cursos/${course.id}/actualizar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          description: description.trim() || null,
          level: level || null,
          included_in_premium: includedInPremium,
          price_cents: priceCents.trim() === '' ? null : Number(priceCents),
        }),
      });
      const body: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setSaveError(body.error ?? 'db_error');
        return;
      }
      toast.success(t.actions.save);
    } catch {
      setSaveError('db_error');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(next: CourseStatus) {
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/admin/cursos/${course.id}/estado`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}));
        toast.error(errorMessage(body.error ?? 'db_error') ?? errors.db_error);
        return;
      }
      setCourse((c) => ({ ...c, status: next }));
      toast.success(t.status[next]);
    } catch {
      toast.error(errors.db_error);
    } finally {
      setStatusBusy(false);
    }
  }

  async function grant() {
    setGranting(true);
    setGrantError(null);
    try {
      const res = await fetch(`/api/admin/cursos/${course.id}/acceso/otorgar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: grantEmail.trim() }),
      });
      const body: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setGrantError(body.error ?? 'db_error');
        return;
      }
      setOwners((list) => [
        { userId: 'pending', email: grantEmail.trim(), source: 'grant', createdAt: new Date().toISOString() },
        ...list,
      ]);
      setGrantEmail('');
      toast.success(t.grantButton);
    } catch {
      setGrantError('db_error');
    } finally {
      setGranting(false);
    }
  }

  async function revoke(userId: string) {
    setRevokingUserId(userId);
    try {
      const res = await fetch(`/api/admin/cursos/${course.id}/acceso/${userId}/revocar`, { method: 'POST' });
      if (!res.ok) {
        toast.error(errors.db_error);
        return;
      }
      setOwners((list) => list.filter((o) => o.userId !== userId));
    } catch {
      toast.error(errors.db_error);
    } finally {
      setRevokingUserId(null);
    }
  }

  const statusActions: { key: CourseStatus; label: string }[] =
    course.status === 'draft'
      ? [{ key: 'published', label: t.actions.publish }]
      : course.status === 'published'
        ? [{ key: 'archived', label: t.actions.archive }]
        : [{ key: 'draft', label: t.actions.unpublish }];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" data-testid="course-status-panel">
        <span
          data-testid="course-status-badge"
          className="inline-flex w-fit items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
        >
          {t.status[course.status]}
        </span>
        <div className="flex gap-2">
          {statusActions.map((action) => (
            <Button
              key={action.key}
              type="button"
              variant="outline"
              data-testid={`course-status-${action.key}`}
              disabled={statusBusy}
              loading={statusBusy}
              onClick={() => void changeStatus(action.key)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </section>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveFields();
        }}
        className="flex flex-col gap-4"
        data-testid="course-fields-form"
      >
        <h2 className="text-lg font-semibold text-foreground">{t.detailsTitle}</h2>
        <Field label={t.fields.title} required>
          {({ id }) => (
            <Input id={id} data-testid="course-field-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          )}
        </Field>
        <Field label={t.fields.subtitle}>
          {({ id }) => (
            <Input id={id} data-testid="course-field-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          )}
        </Field>
        <Field label={t.fields.description}>
          {({ id }) => (
            <Textarea
              id={id}
              data-testid="course-field-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <Field label={t.fields.level}>
          {({ id }) => (
            <Select id={id} data-testid="course-field-level" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl || '—'}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Checkbox
            data-testid="course-field-premium"
            checked={includedInPremium}
            onCheckedChange={(checked) => setIncludedInPremium(checked === true)}
          />
          {t.fields.includedInPremium}
        </label>
        <Field label={t.fields.priceCents}>
          {({ id }) => (
            <Input
              id={id}
              type="number"
              min={0}
              data-testid="course-field-price"
              value={priceCents}
              onChange={(e) => setPriceCents(e.target.value)}
            />
          )}
        </Field>
        {saveError && (
          <p data-testid="course-fields-error" role="alert" className="text-sm text-destructive">
            {errorMessage(saveError)}
          </p>
        )}
        <div>
          <Button type="submit" data-testid="course-fields-submit" disabled={saving} loading={saving}>
            {t.actions.save}
          </Button>
        </div>
      </form>

      <ModuleManager lang={lang} courseId={course.id} initialModules={initialModules} />

      <section className="flex flex-col gap-4" data-testid="course-access-panel">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t.accessTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.accessDescription}</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void grant();
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <Field label={t.grantEmailLabel} className="flex-1">
            {({ id }) => (
              <Input
                id={id}
                type="email"
                data-testid="course-grant-email"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                required
              />
            )}
          </Field>
          <Button type="submit" data-testid="course-grant-submit" disabled={granting} loading={granting}>
            {t.grantButton}
          </Button>
        </form>
        {grantError && (
          <p data-testid="course-grant-error" role="alert" className="text-sm text-destructive">
            {errorMessage(grantError)}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t.ownersTitle}</h3>
          {owners.length === 0 ? (
            <p data-testid="course-owners-empty" className="text-sm text-muted-foreground">
              {t.ownersEmpty}
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="course-owners-list">
              {owners.map((owner) => (
                <li key={owner.userId} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span>
                    {owner.email ?? owner.userId} · {t.source[owner.source]}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid={`course-owner-revoke-${owner.userId}`}
                    disabled={revokingUserId === owner.userId}
                    loading={revokingUserId === owner.userId}
                    onClick={() => void revoke(owner.userId)}
                  >
                    {t.revoke}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
