/**
 * LessonForm — the add/edit form for one lesson inside `ModuleManager`
 * (`CourseEditPanel`'s module/lesson authoring panel). One form for both
 * "create" and "edit": `initial` seeds every field when editing, and
 * `onSubmit` is the only way this component talks to its parent (a plain
 * React callback prop — this is a CHILD of the `client:load` island, not an
 * Astro->React boundary itself, so a function prop here is fine; only the
 * top-level island's own props must stay serializable).
 *
 * `kind: 'text'` renders a live sanitized preview through the exact same
 * `renderLessonMarkdown` the public lesson player uses, so what an author
 * sees while typing is what a visitor gets — never an approximation.
 */
import { useEffect, useMemo, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { renderLessonMarkdown } from '@/lib/courses/markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';

export type LessonKind = 'text' | 'video' | 'activity';

export interface LessonFormValues {
  title: string;
  kind: LessonKind;
  content: Record<string, unknown>;
  duration_min: number | null;
  is_preview: boolean;
}

export interface LessonFormInitial extends LessonFormValues {
  id: string;
}

export interface ActivityOption {
  id: string;
  title: string;
  level: string | null;
}

export interface LessonFormProps {
  lang: Lang;
  initial?: LessonFormInitial;
  onSubmit: (values: LessonFormValues) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
  submitLabel: string;
  submittingLabel: string;
}

function activityIdOf(content: Record<string, unknown>): string {
  return typeof content.activityId === 'string' ? content.activityId : '';
}

export default function LessonForm({
  lang,
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  submittingLabel,
}: LessonFormProps) {
  const t = UI_LABELS[lang].admin.cursos;
  const fieldsT = t.lessons.fields;
  const errors = t.errors as Record<string, string>;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [kind, setKind] = useState<LessonKind>(initial?.kind ?? 'text');
  const [markdown, setMarkdown] = useState(
    initial?.kind === 'text' && typeof initial.content.markdown === 'string' ? initial.content.markdown : '',
  );
  const [videoUrl, setVideoUrl] = useState(
    initial?.kind === 'video' && typeof initial.content.url === 'string' ? initial.content.url : '',
  );
  const [activityQuery, setActivityQuery] = useState('');
  const [activityResults, setActivityResults] = useState<ActivityOption[]>([]);
  const [activitySearching, setActivitySearching] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityOption | null>(
    initial?.kind === 'activity' && activityIdOf(initial.content)
      ? { id: activityIdOf(initial.content), title: '', level: null }
      : null,
  );
  const [durationMin, setDurationMin] = useState(initial?.duration_min != null ? String(initial.duration_min) : '');
  const [isPreview, setIsPreview] = useState(initial?.is_preview ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => (kind === 'text' ? renderLessonMarkdown(markdown) : null), [kind, markdown]);

  useEffect(() => {
    if (kind !== 'activity' || activityQuery.trim().length === 0) {
      setActivityResults([]);
      return;
    }
    let cancelled = false;
    setActivitySearching(true);
    const handle = window.setTimeout(() => {
      fetch(`/api/admin/cursos/actividades/buscar?q=${encodeURIComponent(activityQuery.trim())}`)
        .then((res) => (res.ok ? res.json() : { activities: [] }))
        .then((body: { activities?: ActivityOption[] }) => {
          if (!cancelled) setActivityResults(body.activities ?? []);
        })
        .catch(() => {
          if (!cancelled) setActivityResults([]);
        })
        .finally(() => {
          if (!cancelled) setActivitySearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [kind, activityQuery]);

  function content(): Record<string, unknown> {
    if (kind === 'text') return { markdown };
    if (kind === 'video') return { url: videoUrl };
    return { activityId: selectedActivity?.id ?? '' };
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit({
        title: title.trim(),
        kind,
        content: content(),
        duration_min: durationMin.trim() === '' ? null : Number(durationMin),
        is_preview: isPreview,
      });
      if (!result.ok) {
        setError(result.error ?? 'db_error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const errorMessage = error ? (errors[error] ?? errors.db_error) : null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-3 rounded-lg bg-muted/30 p-4"
      data-testid={`lesson-form-${initial?.id ?? 'new'}`}
    >
      <Field label={fieldsT.title} required>
        {({ id }) => (
          <Input id={id} data-testid="lesson-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        )}
      </Field>

      <Field label={fieldsT.kind}>
        {({ id }) => (
          <Select id={id} data-testid="lesson-kind" value={kind} onChange={(e) => setKind(e.target.value as LessonKind)}>
            <option value="text">{fieldsT.kindText}</option>
            <option value="video">{fieldsT.kindVideo}</option>
            <option value="activity">{fieldsT.kindActivity}</option>
          </Select>
        )}
      </Field>

      {kind === 'text' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={fieldsT.markdown}>
            {({ id }) => (
              <Textarea
                id={id}
                data-testid="lesson-markdown"
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                rows={8}
              />
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-foreground">{fieldsT.markdownPreview}</span>
            <div
              data-testid="lesson-markdown-preview"
              className="prose prose-sm max-w-none rounded-md border border-border bg-background p-3 text-foreground"
              // Rendered through `renderLessonMarkdown` — sanitized HTML only, never raw author input.
              dangerouslySetInnerHTML={{ __html: preview ?? '' }}
            />
          </div>
        </div>
      )}

      {kind === 'video' && (
        <Field label={fieldsT.videoUrl} hint={fieldsT.videoUrlHint}>
          {({ id }) => (
            <Input
              id={id}
              data-testid="lesson-video-url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          )}
        </Field>
      )}

      {kind === 'activity' && (
        <div className="flex flex-col gap-2">
          {selectedActivity ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <span data-testid="lesson-activity-selected">
                {fieldsT.activitySelected}: {selectedActivity.title || selectedActivity.id}
              </span>
              <Button type="button" variant="ghost" data-testid="lesson-activity-change" onClick={() => setSelectedActivity(null)}>
                {fieldsT.activityChange}
              </Button>
            </div>
          ) : (
            <>
              <Field label={fieldsT.activitySearch}>
                {({ id }) => (
                  <Input
                    id={id}
                    data-testid="lesson-activity-search"
                    value={activityQuery}
                    onChange={(e) => setActivityQuery(e.target.value)}
                    placeholder={fieldsT.activitySearchPlaceholder}
                  />
                )}
              </Field>
              {activitySearching && <p className="text-xs text-muted-foreground">{fieldsT.activitySearching}</p>}
              {!activitySearching && activityQuery.trim() !== '' && activityResults.length === 0 && (
                <p data-testid="lesson-activity-none" className="text-xs text-muted-foreground">
                  {fieldsT.activityNone}
                </p>
              )}
              {activityResults.length > 0 && (
                <ul className="flex flex-col gap-1" data-testid="lesson-activity-results">
                  {activityResults.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        data-testid={`lesson-activity-option-${option.id}`}
                        onClick={() => setSelectedActivity(option)}
                        className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        {option.title}
                        {option.level ? ` · ${option.level}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <Field label={fieldsT.duration}>
        {({ id }) => (
          <Input
            id={id}
            type="number"
            min={1}
            data-testid="lesson-duration"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
          />
        )}
      </Field>

      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Checkbox
          data-testid="lesson-is-preview"
          checked={isPreview}
          onCheckedChange={(checked) => setIsPreview(checked === true)}
        />
        {fieldsT.isPreview}
      </label>

      {errorMessage && (
        <p data-testid="lesson-form-error" role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" data-testid="lesson-form-submit" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
        <Button type="button" variant="ghost" data-testid="lesson-form-cancel" onClick={onCancel} disabled={submitting}>
          {t.modules.cancel}
        </Button>
      </div>
    </form>
  );
}
