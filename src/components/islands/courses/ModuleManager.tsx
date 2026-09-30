/**
 * ModuleManager — the modules + lessons authoring panel inside
 * `CourseEditPanel` (`/[lang]/admin/cursos/[id]`). Owns the module/lesson
 * tree's local state and talks to `/api/admin/cursos/[courseId]/modulos/**`;
 * reordering uses simple up/down buttons (not drag-and-drop) and posts the
 * FULL resulting id order to `.../orden`, matching `reorderModules`'s /
 * `reorderLessons`'s own two-phase renumbering contract.
 *
 * A plain React component, not its own `client:load` island — it is a
 * CHILD of `CourseEditPanel`'s island, so function props between it and
 * `LessonForm`/`CourseEditPanel` are fine; only the top-level island's own
 * props must stay serializable.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LessonForm, { type LessonFormValues, type LessonKind } from './LessonForm';

export interface LessonRecord {
  id: string;
  position: number;
  title: string;
  kind: LessonKind;
  content: Record<string, unknown>;
  duration_min: number | null;
  is_preview: boolean;
}

export interface ModuleRecord {
  id: string;
  position: number;
  title: string;
  lessons: LessonRecord[];
}

export interface ModuleManagerProps {
  lang: Lang;
  courseId: string;
  initialModules: ModuleRecord[];
}

async function postJson(url: string, body?: unknown): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof data.error === 'string' ? data.error : 'db_error' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'db_error' };
  }
}

function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function ModuleManager({ lang, courseId, initialModules }: ModuleManagerProps) {
  const t = UI_LABELS[lang].admin.cursos;
  const errors = t.errors as Record<string, string>;
  const errorMessage = (key?: string) => (key ? (errors[key] ?? errors.db_error) : errors.db_error);

  const [modules, setModules] = useState(initialModules);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [addingModule, setAddingModule] = useState(false);
  const [renamingModuleId, setRenamingModuleId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyModuleId, setBusyModuleId] = useState<string | null>(null);
  const [addingLessonFor, setAddingLessonFor] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<{ moduleId: string; lessonId: string } | null>(null);
  const [busyLessonId, setBusyLessonId] = useState<string | null>(null);

  async function addModule() {
    const title = newModuleTitle.trim();
    if (title.length === 0) return;
    setAddingModule(true);
    const result = await postJson(`/api/admin/cursos/${courseId}/modulos`, { title });
    setAddingModule(false);
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      return;
    }
    const id = result.data?.id as string;
    setModules((list) => [...list, { id, position: list.length, title, lessons: [] }]);
    setNewModuleTitle('');
  }

  async function renameModule(moduleId: string) {
    const title = renameValue.trim();
    if (title.length === 0) return;
    setBusyModuleId(moduleId);
    const result = await postJson(`/api/admin/cursos/${courseId}/modulos/${moduleId}/renombrar`, { title });
    setBusyModuleId(null);
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      return;
    }
    setModules((list) => list.map((m) => (m.id === moduleId ? { ...m, title } : m)));
    setRenamingModuleId(null);
  }

  async function deleteModule(moduleId: string) {
    if (!window.confirm(t.modules.confirmDelete)) return;
    setBusyModuleId(moduleId);
    const result = await postJson(`/api/admin/cursos/${courseId}/modulos/${moduleId}/eliminar`);
    setBusyModuleId(null);
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      return;
    }
    setModules((list) => list.filter((m) => m.id !== moduleId));
  }

  async function moveModule(index: number, direction: -1 | 1) {
    const reordered = move(modules, index, direction);
    if (reordered === modules) return;
    setModules(reordered);
    const result = await postJson(`/api/admin/cursos/${courseId}/modulos/orden`, {
      moduleIds: reordered.map((m) => m.id),
    });
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      setModules(modules);
    }
  }

  async function addLesson(moduleId: string, values: LessonFormValues) {
    const result = await postJson(`/api/admin/cursos/${courseId}/modulos/${moduleId}/lecciones`, values);
    if (!result.ok) return { ok: false, error: result.error };
    const id = result.data?.id as string;
    setModules((list) =>
      list.map((m) =>
        m.id === moduleId
          ? { ...m, lessons: [...m.lessons, { id, position: m.lessons.length, ...values }] }
          : m,
      ),
    );
    setAddingLessonFor(null);
    return { ok: true };
  }

  async function saveLesson(moduleId: string, lessonId: string, values: LessonFormValues) {
    const result = await postJson(
      `/api/admin/cursos/${courseId}/modulos/${moduleId}/lecciones/${lessonId}/actualizar`,
      values,
    );
    if (!result.ok) return { ok: false, error: result.error };
    setModules((list) =>
      list.map((m) =>
        m.id === moduleId
          ? { ...m, lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, ...values } : l)) }
          : m,
      ),
    );
    setEditingLesson(null);
    return { ok: true };
  }

  async function deleteLesson(moduleId: string, lessonId: string) {
    if (!window.confirm(t.lessons.confirmDelete)) return;
    setBusyLessonId(lessonId);
    const result = await postJson(`/api/admin/cursos/${courseId}/modulos/${moduleId}/lecciones/${lessonId}/eliminar`);
    setBusyLessonId(null);
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      return;
    }
    setModules((list) =>
      list.map((m) => (m.id === moduleId ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) } : m)),
    );
  }

  async function moveLesson(moduleId: string, index: number, direction: -1 | 1) {
    const mod = modules.find((m) => m.id === moduleId);
    if (!mod) return;
    const reordered = move(mod.lessons, index, direction);
    if (reordered === mod.lessons) return;
    setModules((list) => list.map((m) => (m.id === moduleId ? { ...m, lessons: reordered } : m)));
    const result = await postJson(`/api/admin/cursos/${courseId}/modulos/${moduleId}/lecciones/orden`, {
      lessonIds: reordered.map((l) => l.id),
    });
    if (!result.ok) {
      toast.error(errorMessage(result.error));
      setModules((list) => list.map((m) => (m.id === moduleId ? { ...m, lessons: mod.lessons } : m)));
    }
  }

  return (
    <section className="flex flex-col gap-4" data-testid="module-manager">
      <h2 className="text-lg font-semibold text-foreground">{t.modules.title}</h2>

      {modules.length === 0 && (
        <p data-testid="modules-empty" className="text-sm text-muted-foreground">
          {t.modules.empty}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {modules.map((mod, index) => (
          <div key={mod.id} className="flex flex-col gap-3 rounded-lg border border-border p-4" data-testid={`module-${mod.id}`}>
            <div className="flex items-center justify-between gap-2">
              {renamingModuleId === mod.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    data-testid={`module-rename-input-${mod.id}`}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder={t.modules.renamePlaceholder}
                  />
                  <Button
                    type="button"
                    data-testid={`module-rename-save-${mod.id}`}
                    disabled={busyModuleId === mod.id}
                    onClick={() => void renameModule(mod.id)}
                  >
                    {busyModuleId === mod.id ? t.modules.renaming : t.modules.save}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setRenamingModuleId(null)}>
                    {t.modules.cancel}
                  </Button>
                </div>
              ) : (
                <span className="font-medium text-foreground">{mod.title}</span>
              )}

              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t.modules.moveUp}
                  data-testid={`module-up-${mod.id}`}
                  disabled={index === 0}
                  onClick={() => void moveModule(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={t.modules.moveDown}
                  data-testid={`module-down-${mod.id}`}
                  disabled={index === modules.length - 1}
                  onClick={() => void moveModule(index, 1)}
                >
                  ↓
                </Button>
                {renamingModuleId !== mod.id && (
                  <Button
                    type="button"
                    variant="outline"
                    data-testid={`module-rename-${mod.id}`}
                    onClick={() => {
                      setRenamingModuleId(mod.id);
                      setRenameValue(mod.title);
                    }}
                  >
                    {t.modules.rename}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  data-testid={`module-delete-${mod.id}`}
                  disabled={busyModuleId === mod.id}
                  onClick={() => void deleteModule(mod.id)}
                >
                  {busyModuleId === mod.id ? t.modules.deleting : t.modules.delete}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2" data-testid={`module-lessons-${mod.id}`}>
              {mod.lessons.length === 0 && addingLessonFor !== mod.id && (
                <p data-testid={`lessons-empty-${mod.id}`} className="text-sm text-muted-foreground">
                  {t.lessons.empty}
                </p>
              )}

              {mod.lessons.map((lesson, lessonIndex) =>
                editingLesson?.moduleId === mod.id && editingLesson.lessonId === lesson.id ? (
                  <LessonForm
                    key={lesson.id}
                    lang={lang}
                    initial={lesson}
                    onSubmit={(values) => saveLesson(mod.id, lesson.id, values)}
                    onCancel={() => setEditingLesson(null)}
                    submitLabel={t.lessons.save}
                    submittingLabel={t.actions.saving}
                  />
                ) : (
                  <div
                    key={lesson.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                    data-testid={`lesson-${lesson.id}`}
                  >
                    <span>
                      {lesson.title}
                      {lesson.is_preview && (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          {t.lessons.previewTag}
                        </span>
                      )}
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={t.lessons.moveUp}
                        data-testid={`lesson-up-${lesson.id}`}
                        disabled={lessonIndex === 0}
                        onClick={() => void moveLesson(mod.id, lessonIndex, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={t.lessons.moveDown}
                        data-testid={`lesson-down-${lesson.id}`}
                        disabled={lessonIndex === mod.lessons.length - 1}
                        onClick={() => void moveLesson(mod.id, lessonIndex, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        data-testid={`lesson-edit-${lesson.id}`}
                        onClick={() => setEditingLesson({ moduleId: mod.id, lessonId: lesson.id })}
                      >
                        {t.lessons.edit}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        data-testid={`lesson-delete-${lesson.id}`}
                        disabled={busyLessonId === lesson.id}
                        onClick={() => void deleteLesson(mod.id, lesson.id)}
                      >
                        {busyLessonId === lesson.id ? t.lessons.deleting : t.lessons.delete}
                      </Button>
                    </div>
                  </div>
                ),
              )}

              {addingLessonFor === mod.id ? (
                <LessonForm
                  lang={lang}
                  onSubmit={(values) => addLesson(mod.id, values)}
                  onCancel={() => setAddingLessonFor(null)}
                  submitLabel={t.lessons.addButton}
                  submittingLabel={t.lessons.adding}
                />
              ) : (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid={`lesson-add-${mod.id}`}
                    onClick={() => setAddingLessonFor(mod.id)}
                  >
                    {t.lessons.addButton}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void addModule();
        }}
        className="flex items-end gap-2"
        data-testid="module-add-form"
      >
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-semibold text-foreground" htmlFor="new-module-title">
            {t.modules.addLabel}
          </label>
          <Input
            id="new-module-title"
            data-testid="module-add-input"
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            placeholder={t.modules.addPlaceholder}
          />
        </div>
        <Button type="submit" data-testid="module-add-submit" disabled={addingModule}>
          {addingModule ? t.modules.adding : t.modules.addButton}
        </Button>
      </form>
    </section>
  );
}
