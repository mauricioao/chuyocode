/**
 * ExercisePublishFlow — the network wiring around `ExerciseAuthorIsland`
 * (slice 17, design.md §8 "Publish flow").
 *
 * `ExerciseAuthorIsland` stays a pure-prop shell: its `onSave` contract
 * (`AuthoringSaveInput = { payload, blocks, publish, acceptedTerms }`) is
 * unchanged, and its own test file keeps covering the draft/editor
 * behaviour. THIS component is the one thing slice 17 adds around it: it
 * supplies `onSave`, POSTs to `POST /api/ejercicios/[id]/guardar`, and
 * renders the result — saved, published (with the resolved URL), validation
 * issues (the existing `exerciseValidatorCopy.ts` es/en copy), terms
 * required, and any other error the endpoint reports.
 *
 * MOUNTED ONLY FROM `crear/[id].astro` (an EXISTING exercise). `exerciseId`
 * is a real, already-owned row's id — Astro pages cannot pass a function
 * prop across the server/island boundary, so this component (not the page)
 * is what supplies `onSave`. `crear/index.astro` (a brand-new exercise, no
 * row yet) still mounts the bare `ExerciseAuthorIsland` with no `onSave`:
 * see this file's own header note and the slice's report for why a new
 * exercise cannot be created through this endpoint yet (no UI anywhere
 * collects the row's `skill`/`level`/`focus`/`slug`, which are `NOT NULL`
 * and effectively permanent — `guardar.ts`'s header has the full reasoning).
 *
 * `messageFor` is local COPY the same way `ExerciseAuthorIsland.COPY` is —
 * "the interactive block editors keep their own LOCAL copy" (design.md §8).
 */
import { useState } from 'react';
import ExerciseAuthorIsland, { type AuthoringSaveInput } from './ExerciseAuthorIsland';
import type { Draft } from '@/lib/authoringDraft';
import { messageFor } from '@/lib/exerciseValidatorCopy';
import type { ValidationIssue } from '@/lib/exerciseValidator';

export const COPY = {
  es: {
    saved: 'Guardado como borrador.',
    published: (url: string) => `Publicado. Ver el ejercicio: ${url}`,
    termsRequired: 'Aceptá los términos de publicación para publicar por primera vez.',
    invalidTransition: 'Este ejercicio no se puede publicar desde su estado actual.',
    slugCollision: 'No se pudo resolver un slug único para este ejercicio. Probá de nuevo.',
    exerciseRemoved: 'Este ejercicio fue eliminado y ya no se puede editar.',
    forbidden: 'No tenés permiso para editar este ejercicio.',
    notFound: 'Este ejercicio no existe.',
    genericError: 'Ocurrió un error al guardar. Intentá de nuevo.',
    saving: 'Guardando…',
  },
  en: {
    saved: 'Saved as draft.',
    published: (url: string) => `Published. View the exercise: ${url}`,
    termsRequired: 'Accept the publishing terms to publish for the first time.',
    invalidTransition: 'This exercise cannot be published from its current state.',
    slugCollision: 'Could not resolve a unique slug for this exercise. Try again.',
    exerciseRemoved: 'This exercise was removed and can no longer be edited.',
    forbidden: "You don't have permission to edit this exercise.",
    notFound: 'This exercise does not exist.',
    genericError: 'Something went wrong while saving. Please try again.',
    saving: 'Saving…',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

/** Endpoint-reported error codes this component knows how to explain. */
const ERROR_COPY_KEY: Record<string, keyof Omit<Copy, 'saved' | 'published' | 'saving'>> = {
  terms_required: 'termsRequired',
  invalid_transition: 'invalidTransition',
  slug_collision_unresolved: 'slugCollision',
  exercise_removed: 'exerciseRemoved',
  forbidden: 'forbidden',
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveResponseBody {
  ok: boolean;
  code?: string;
  issues?: ValidationIssue[];
  slug?: string;
  url?: string;
}

function isValidationIssueList(value: unknown): value is ValidationIssue[] {
  return Array.isArray(value);
}

export interface ExercisePublishFlowProps {
  lang: string;
  exerciseId: string;
  initialDraft: Draft;
}

export default function ExercisePublishFlow({ lang, exerciseId, initialDraft }: ExercisePublishFlowProps) {
  const t = copyFor(lang);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  function errorMessageFor(res: Response, body: SaveResponseBody | null): string {
    const key = body?.code ? ERROR_COPY_KEY[body.code] : undefined;
    if (key) {
      const entry = t[key];
      return typeof entry === 'function' ? '' : entry;
    }
    if (res.status === 404) return t.notFound;
    if (body?.code === 'payload_unparseable') {
      return messageFor('payload_unparseable', lang);
    }
    return t.genericError;
  }

  async function handleSave(input: AuthoringSaveInput) {
    setStatus('saving');
    setMessage(null);
    setIssues([]);

    let res: Response;
    let body: SaveResponseBody | null;
    try {
      res = await fetch(`/api/ejercicios/${exerciseId}/guardar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      body = (await res.json().catch(() => null)) as SaveResponseBody | null;
    } catch {
      setStatus('error');
      setMessage(t.genericError);
      return;
    }

    if (res.status === 200 && body?.ok && body.url) {
      setStatus('saved');
      setMessage(input.publish ? t.published(`/${lang}${body.url}`) : t.saved);
      return;
    }

    if (res.status === 422 && isValidationIssueList(body?.issues) && body.issues.length > 0) {
      setStatus('error');
      setIssues(body.issues);
      return;
    }

    setStatus('error');
    setMessage(errorMessageFor(res, body));
  }

  return (
    <div className="flex flex-col gap-4">
      <ExerciseAuthorIsland lang={lang} initialDraft={initialDraft} onSave={handleSave} />

      {status === 'saving' && (
        <p data-testid="save-status" role="status">
          {t.saving}
        </p>
      )}
      {status === 'saved' && message && (
        <p data-testid="save-status" role="status">
          {message}
        </p>
      )}
      {status === 'error' && (
        <div data-testid="save-error" role="alert" className="text-sm text-red-400">
          {message && <p>{message}</p>}
          {issues.length > 0 && (
            <ul>
              {issues.map((issue, index) => (
                <li key={`${issue.code}-${issue.slotId ?? ''}-${issue.poolName ?? ''}-${index}`}>
                  {messageFor(issue.code, lang)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
