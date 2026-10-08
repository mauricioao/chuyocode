/**
 * GroupSortEditor — the authoring surface for a `template: 'groupsort'` quiz
 * block ("Ordenar por grupos"). A `groupsort` block is a list of GROUPS, not
 * questions — `groupSort.ts`'s own `GroupSortGroupRow` ({@link
 * GroupSortGroupRow}) renders instead of the full Google-Forms-style
 * {@link QuestionCard} list here, same posture as `MatchPairsEditor.tsx`/
 * `ReorderEditor.tsx`/`ClozeEditor.tsx`.
 *
 * ONE CARD PER GROUP: a name field plus its items as quick chips — type an
 * item, Enter adds it (a comma-separated paste adds several, same code path,
 * see `groupSort.ts`'s own header), "×" removes it. "+ Agregar grupo" stops
 * once {@link MAX_GROUPSORT_GROUPS} groups exist (owner spec: "keep it to 4
 * max for a big readable board"). Calm, non-blocking hints nudge towards
 * >= 2 groups and >= 2 items per group (`gameModes.ts`'s own eligibility
 * rule) rather than hard-blocking anything — exactly like `MatchPairsEditor`'s
 * own "Agrega al menos 3 parejas" hint.
 */
import { useEffect, useRef, useState } from 'react';
import { TrashIcon } from '@phosphor-icons/react/dist/ssr/Trash';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MAX_GROUPSORT_GROUPS, MIN_GROUPSORT_ITEMS_PER_GROUP, type GroupSortGroupRow } from '@/lib/activities/groupSort';

export const COPY = {
  es: {
    groupNameLabel: 'Nombre del grupo',
    groupNamePlaceholder: 'Ej. Animales',
    itemsLabel: 'Elementos',
    itemPlaceholder: 'Escribe un elemento y presiona Enter',
    removeItem: 'Quitar elemento',
    removeGroup: 'Quitar este grupo',
    addGroup: '+ Agregar grupo',
    minGroupsHint: 'Agrega al menos 2 grupos para jugar',
    minItemsHint: (n: number) => `Agrega al menos ${n} elementos a este grupo`,
    maxGroupsHint: `Máximo ${MAX_GROUPSORT_GROUPS} grupos, para que el tablero se lea bien`,
  },
  en: {
    groupNameLabel: 'Group name',
    groupNamePlaceholder: 'E.g. Animals',
    itemsLabel: 'Items',
    itemPlaceholder: 'Type an item and press Enter',
    removeItem: 'Remove item',
    removeGroup: 'Remove this group',
    addGroup: '+ Add group',
    minGroupsHint: 'Add at least 2 groups to play',
    minItemsHint: (n: number) => `Add at least ${n} items to this group`,
    maxGroupsHint: `Up to ${MAX_GROUPSORT_GROUPS} groups, so the board stays easy to read`,
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface GroupSortEditorProps {
  blockId: string;
  lang: string;
  groups: GroupSortGroupRow[];
  /** The group whose name field should take focus next (a freshly added row) — `null` for none. */
  focusSlotId?: string | null;
  onLabelChange: (slotId: string, label: string) => void;
  onAddItems: (slotId: string, text: string) => void;
  onRemoveItem: (slotId: string, itemId: string) => void;
  onAdd: () => void;
  onRemove: (rowId: string) => void;
}

export default function GroupSortEditor({
  blockId,
  lang,
  groups,
  focusSlotId = null,
  onLabelChange,
  onAddItems,
  onRemoveItem,
  onAdd,
  onRemove,
}: GroupSortEditorProps) {
  const t = copyFor(lang);
  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Each group's own in-progress "type an item" text — ephemeral UI state,
  // never part of the authored `Draft` (same reasoning `QuestionCard.tsx`'s
  // own `answerDraft` gives for its answer-chip input).
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!focusSlotId) return;
    nameRefs.current[focusSlotId]?.focus();
  }, [focusSlotId]);

  function commitItemDraft(slotId: string) {
    const text = itemDrafts[slotId] ?? '';
    if (text.trim() === '') return;
    onAddItems(slotId, text);
    setItemDrafts((prev) => ({ ...prev, [slotId]: '' }));
  }

  const canAddMore = groups.length < MAX_GROUPSORT_GROUPS;

  return (
    <div data-testid={`groupsort-editor-${blockId}`} className="flex flex-col gap-3">
      {groups.length < 2 && (
        <p data-testid={`groupsort-min-groups-hint-${blockId}`} className="text-sm text-muted-foreground">
          {t.minGroupsHint}
        </p>
      )}

      {groups.length > 0 && (
        <div data-testid={`groupsort-list-${blockId}`} className="flex flex-col gap-3">
          {groups.map((group, index) => (
            <div
              key={group.rowId}
              data-testid={`groupsort-group-${group.slotId}`}
              className="flex flex-col gap-2 rounded-lg border border-border p-3"
            >
              <div className="flex items-center gap-2">
                <Input
                  ref={(node) => {
                    nameRefs.current[group.slotId] = node;
                  }}
                  type="text"
                  aria-label={`${t.groupNameLabel} ${index + 1}`}
                  placeholder={t.groupNamePlaceholder}
                  data-testid={`groupsort-name-${group.slotId}`}
                  value={group.label}
                  onChange={(event) => onLabelChange(group.slotId, event.target.value)}
                  className={cn('min-h-11 min-w-0 flex-1 text-base font-medium')}
                />
                <button
                  type="button"
                  aria-label={t.removeGroup}
                  data-testid={`groupsort-remove-group-${group.slotId}`}
                  onClick={() => onRemove(group.rowId)}
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <TrashIcon aria-hidden="true" />
                </button>
              </div>

              <div
                data-testid={`groupsort-items-${group.slotId}`}
                aria-label={t.itemsLabel}
                className="flex flex-wrap items-center gap-1.5"
              >
                {group.items.map((item) => (
                  <span
                    key={item.id}
                    data-testid={`groupsort-item-${item.id}`}
                    className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-sm text-foreground"
                  >
                    {item.text}
                    <button
                      type="button"
                      aria-label={`${t.removeItem} ${item.text}`}
                      data-testid={`groupsort-remove-item-${item.id}`}
                      onClick={() => onRemoveItem(group.slotId, item.id)}
                      className="flex max-lg:min-h-11 max-lg:min-w-11 items-center justify-center text-muted-foreground hover:text-destructive"
                    >
                      <TrashIcon aria-hidden="true" size={12} />
                    </button>
                  </span>
                ))}
              </div>

              <Input
                type="text"
                fieldSize="sm"
                aria-label={`${t.itemsLabel} ${index + 1}`}
                placeholder={t.itemPlaceholder}
                data-testid={`groupsort-item-input-${group.slotId}`}
                value={itemDrafts[group.slotId] ?? ''}
                onChange={(event) => setItemDrafts((prev) => ({ ...prev, [group.slotId]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
                  event.preventDefault();
                  commitItemDraft(group.slotId);
                }}
                className="w-full max-w-sm"
              />

              {group.items.length < MIN_GROUPSORT_ITEMS_PER_GROUP && (
                <p data-testid={`groupsort-min-items-hint-${group.slotId}`} className="text-xs text-muted-foreground">
                  {t.minItemsHint(MIN_GROUPSORT_ITEMS_PER_GROUP)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {canAddMore ? (
        <button
          type="button"
          data-testid={`groupsort-add-${blockId}`}
          onClick={onAdd}
          className="min-h-11 w-fit rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          {t.addGroup}
        </button>
      ) : (
        <p data-testid={`groupsort-max-groups-hint-${blockId}`} className="text-xs text-muted-foreground">
          {t.maxGroupsHint}
        </p>
      )}
    </div>
  );
}
