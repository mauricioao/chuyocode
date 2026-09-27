/**
 * WorksheetZoneEditor — the canvas + properties panel for drawing/editing a
 * worksheet block's answer zones (PR B, "Activities creator").
 *
 * The image + its zones are ONE canvas: pointer drag on empty space draws a
 * new zone, drag on a zone's body moves it, drag on one of its four corner
 * handles resizes it — every one of those delegates its math to
 * `src/lib/activities/zoneGeometry.ts` (pure, unit-tested there), this
 * component only translates pointer coordinates into calls.
 *
 * ACCESSIBLE FALLBACK, DELIBERATE: pointer dragging on a live image is a
 * manual/Playwright check (jsdom has no real layout — `getBoundingClientRect`
 * always returns zeros — matching this codebase's own precedent for
 * `imagePipeline.ts`'s canvas functions). The "Agregar zona" button adds a
 * zone at a sensible default rect with NO drag required at all, which is
 * both the automated tests' way in and the keyboard-only/accessible path a
 * pointer-only canvas would otherwise lack entirely.
 *
 * Selecting a zone opens its properties panel (kind, answers, options) —
 * this component's analogue of the editor's "right panel". Arrow keys nudge
 * the selected zone; Delete/Backspace removes it.
 */
import { useCallback, useRef } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { ImageRef, Zone } from '@/lib/activities/blocks';
import {
  rectFromDrag,
  moveRect,
  resizeRect,
  nudgeRect,
  type Handle,
  type Direction,
  type Rect,
} from '@/lib/activities/zoneGeometry';
import { Button } from '@/components/ui/button';

export interface WorksheetZoneEditorProps {
  lang: Lang;
  image: ImageRef;
  imageUrl: string;
  zones: Zone[];
  selectedZoneId: string | null;
  onZonesChange: (zones: Zone[]) => void;
  onSelectZone: (zoneId: string | null) => void;
}

const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se'];
const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
};

function defaultRect(): Rect {
  return { x: 0.3, y: 0.3, w: 0.2, h: 0.15 };
}

function newZone(): Zone {
  return { id: crypto.randomUUID(), ...defaultRect(), kind: 'text', answers: [''] };
}

type DragMode =
  | { kind: 'draw'; start: { x: number; y: number } }
  | { kind: 'move'; zoneId: string; start: { x: number; y: number }; original: Rect }
  | { kind: 'resize'; zoneId: string; handle: Handle; start: { x: number; y: number }; original: Rect };

export default function WorksheetZoneEditor({
  lang,
  image,
  imageUrl,
  zones,
  selectedZoneId,
  onZonesChange,
  onSelectZone,
}: WorksheetZoneEditorProps) {
  const t = UI_LABELS[lang].activities.worksheet;
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  const containerSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { width: 0, height: 0 };
    const box = el.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }, []);

  const pointFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const el = containerRef.current;
    const box = el?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }, []);

  const updateZoneRect = useCallback(
    (zoneId: string, rect: Rect) => {
      onZonesChange(zones.map((z) => (z.id === zoneId ? { ...z, ...rect } : z)));
    },
    [zones, onZonesChange],
  );

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return; // a zone/handle handles its own pointer down
      onSelectZone(null);
      const start = pointFromEvent(e);
      dragRef.current = { kind: 'draw', start };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [onSelectZone, pointFromEvent],
  );

  const handleZonePointerDown = useCallback(
    (zone: Zone) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onSelectZone(zone.id);
      const start = pointFromEvent(e);
      dragRef.current = { kind: 'move', zoneId: zone.id, start, original: zone };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [onSelectZone, pointFromEvent],
  );

  const handleHandlePointerDown = useCallback(
    (zone: Zone, handle: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onSelectZone(zone.id);
      const start = pointFromEvent(e);
      dragRef.current = { kind: 'resize', zoneId: zone.id, handle, start, original: zone };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [onSelectZone, pointFromEvent],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const size = containerSize();
      const point = pointFromEvent(e);

      if (drag.kind === 'draw') {
        // The in-progress draft is shown by re-deriving it on every move; it
        // is committed as a real zone only on pointer up.
        return;
      }
      if (size.width <= 0 || size.height <= 0) return;

      const dx = (point.x - drag.start.x) / size.width;
      const dy = (point.y - drag.start.y) / size.height;

      if (drag.kind === 'move') {
        updateZoneRect(drag.zoneId, moveRect(drag.original, dx, dy));
      } else if (drag.kind === 'resize') {
        updateZoneRect(drag.zoneId, resizeRect(drag.original, drag.handle, dx, dy));
      }
    },
    [containerSize, pointFromEvent, updateZoneRect],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;

      if (drag.kind === 'draw') {
        const size = containerSize();
        const end = pointFromEvent(e);
        const rect = rectFromDrag(drag.start, end, size);
        const zone: Zone = { id: crypto.randomUUID(), ...rect, kind: 'text', answers: [''] };
        onZonesChange([...zones, zone]);
        onSelectZone(zone.id);
      }
    },
    [containerSize, pointFromEvent, zones, onZonesChange, onSelectZone],
  );

  const handleAddZone = useCallback(() => {
    const zone = newZone();
    onZonesChange([...zones, zone]);
    onSelectZone(zone.id);
  }, [zones, onZonesChange, onSelectZone]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedZoneId) return;
    onZonesChange(zones.filter((z) => z.id !== selectedZoneId));
    onSelectZone(null);
  }, [selectedZoneId, zones, onZonesChange, onSelectZone]);

  const handleZoneKeyDown = useCallback(
    (zone: Zone) => (e: React.KeyboardEvent<HTMLDivElement>) => {
      const directions: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };
      const direction = directions[e.key];
      if (direction) {
        e.preventDefault();
        updateZoneRect(zone.id, nudgeRect(zone, direction));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      }
    },
    [updateZoneRect, handleDeleteSelected],
  );

  const setKind = useCallback(
    (kind: Zone['kind']) => {
      if (!selectedZone) return;
      const next: Zone =
        kind === 'text'
          ? { id: selectedZone.id, x: selectedZone.x, y: selectedZone.y, w: selectedZone.w, h: selectedZone.h, kind: 'text', answers: selectedZone.answers.length > 0 ? selectedZone.answers : [''] }
          : {
              id: selectedZone.id,
              x: selectedZone.x,
              y: selectedZone.y,
              w: selectedZone.w,
              h: selectedZone.h,
              kind: 'choice',
              answers: [],
              options: selectedZone.options && selectedZone.options.length >= 2 ? selectedZone.options : ['', ''],
            };
      onZonesChange(zones.map((z) => (z.id === next.id ? next : z)));
    },
    [selectedZone, zones, onZonesChange],
  );

  const setAnswers = useCallback(
    (answers: string[]) => {
      if (!selectedZone) return;
      onZonesChange(zones.map((z) => (z.id === selectedZone.id ? { ...z, answers } : z)));
    },
    [selectedZone, zones, onZonesChange],
  );

  const setOptions = useCallback(
    (options: string[]) => {
      if (!selectedZone) return;
      const answers = selectedZone.answers.filter((a) => options.includes(a));
      onZonesChange(zones.map((z) => (z.id === selectedZone.id ? { ...z, options, answers } : z)));
    },
    [selectedZone, zones, onZonesChange],
  );

  const toggleOptionCorrect = useCallback(
    (option: string, correct: boolean) => {
      if (!selectedZone) return;
      const answers = correct
        ? [...selectedZone.answers, option]
        : selectedZone.answers.filter((a) => a !== option);
      onZonesChange(zones.map((z) => (z.id === selectedZone.id ? { ...z, answers } : z)));
    },
    [selectedZone, zones, onZonesChange],
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row" data-testid="worksheet-zone-editor">
      <div className="flex-1">
        <div
          ref={containerRef}
          data-testid="zone-canvas"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative w-full touch-none overflow-hidden rounded-lg bg-muted select-none"
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
        >
          <img src={imageUrl} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
          {zones.map((zone) => {
            const selected = zone.id === selectedZoneId;
            const style = {
              left: `${zone.x * 100}%`,
              top: `${zone.y * 100}%`,
              width: `${zone.w * 100}%`,
              height: `${zone.h * 100}%`,
            };
            return (
              <div
                key={zone.id}
                data-testid={`zone-${zone.id}`}
                role="button"
                tabIndex={0}
                aria-label={zone.kind === 'text' ? t.zoneKindText : t.zoneKindChoice}
                aria-pressed={selected}
                onPointerDown={handleZonePointerDown(zone)}
                onKeyDown={handleZoneKeyDown(zone)}
                className={`absolute cursor-move rounded border-2 ${
                  selected ? 'border-primary bg-primary/20' : 'border-accent/70 bg-accent/10'
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50`}
                style={style}
              >
                {selected &&
                  HANDLES.map((handle) => (
                    <div
                      key={handle}
                      data-testid={`handle-${zone.id}-${handle}`}
                      onPointerDown={handleHandlePointerDown(zone, handle)}
                      className={`absolute h-3 w-3 rounded-full border border-primary-foreground bg-primary ${HANDLE_CURSOR[handle]} ${
                        handle.includes('n') ? '-top-1.5' : '-bottom-1.5'
                      } ${handle.includes('w') ? '-left-1.5' : '-right-1.5'}`}
                    />
                  ))}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="outline" data-testid="add-zone" onClick={handleAddZone}>
            + {t.zoneKindText === 'Texto' ? 'Zona' : 'Zone'}
          </Button>
          {zones.length === 0 && <p className="text-xs text-muted-foreground">{t.noZonesYet}</p>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t.addZoneHint}</p>
      </div>

      {selectedZone && (
        <div className="w-full flex-none lg:w-72" data-testid="zone-properties-panel">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{t.zoneKindLabel}</span>
            <Button type="button" size="icon-sm" variant="ghost" data-testid="delete-zone" aria-label={t.zoneDelete} onClick={handleDeleteSelected}>
              ✕
            </Button>
          </div>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label={t.zoneKindLabel}>
            <Button
              type="button"
              size="sm"
              variant={selectedZone.kind === 'text' ? 'default' : 'outline'}
              role="radio"
              aria-checked={selectedZone.kind === 'text'}
              onClick={() => setKind('text')}
            >
              {t.zoneKindText}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={selectedZone.kind === 'choice' ? 'default' : 'outline'}
              role="radio"
              aria-checked={selectedZone.kind === 'choice'}
              onClick={() => setKind('choice')}
            >
              {t.zoneKindChoice}
            </Button>
          </div>

          {selectedZone.kind === 'text' && (
            <div className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t.zoneAnswersLabel}</span>
              {selectedZone.answers.map((answer, i) => (
                <div key={i} className="flex gap-1">
                  <input
                    type="text"
                    value={answer}
                    placeholder={t.zoneAnswerPlaceholder}
                    aria-label={`${t.zoneAnswersLabel} ${i + 1}`}
                    onChange={(e) => {
                      const next = [...selectedZone.answers];
                      next[i] = e.target.value;
                      setAnswers(next);
                    }}
                    className="h-8 flex-1 rounded border border-border bg-background px-2 text-sm"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t.zoneAnswerRemove}
                    disabled={selectedZone.answers.length <= 1}
                    onClick={() => setAnswers(selectedZone.answers.filter((_, j) => j !== i))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setAnswers([...selectedZone.answers, ''])}>
                + {t.zoneAnswerAdd}
              </Button>
            </div>
          )}

          {selectedZone.kind === 'choice' && (
            <div className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t.zoneOptionsLabel}</span>
              {(selectedZone.options ?? []).map((option, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    aria-label={t.zoneOptionCorrect}
                    checked={selectedZone.answers.includes(option)}
                    onChange={(e) => toggleOptionCorrect(option, e.target.checked)}
                  />
                  <input
                    type="text"
                    value={option}
                    placeholder={t.zoneOptionPlaceholder}
                    aria-label={`${t.zoneOptionsLabel} ${i + 1}`}
                    onChange={(e) => {
                      const options = [...(selectedZone.options ?? [])];
                      options[i] = e.target.value;
                      setOptions(options);
                    }}
                    className="h-8 flex-1 rounded border border-border bg-background px-2 text-sm"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t.zoneOptionRemove}
                    disabled={(selectedZone.options ?? []).length <= 2}
                    onClick={() => setOptions((selectedZone.options ?? []).filter((_, j) => j !== i))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setOptions([...(selectedZone.options ?? []), ''])}
              >
                + {t.zoneOptionAdd}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
