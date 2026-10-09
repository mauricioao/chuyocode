/**
 * GroupSortEditor — the authoring surface for a `template: 'groupsort'` quiz
 * block ("Ordenar por grupos"). A `groupsort` block is a list of GROUPS, not
 * questions — `groupSort.ts`'s own `GroupSortGroupRow` ({@link
 * GroupSortGroupRow}) renders instead of the full Google-Forms-style
 * {@link QuestionCard} list here, same posture as `MatchPairsEditor.tsx`/
 * `ReorderEditor.tsx`/`ClozeEditor.tsx` (`TemplateEditorKit.tsx`).
 *
 * ONE SMALL GROUPED CARD PER GROUP: a coloured dot (its board colour, by
 * order) and the group's name as the card's bold header field, then its
 * items as white chips plus an inline "+ elemento" chip input — type an
 * item, Enter adds it (a comma-separated paste adds several, same code
 * path, see `groupSort.ts`'s own header), "×" removes it. "Agregar grupo" (a
 * dashed ghost card) stops once {@link MAX_GROUPSORT_GROUPS} groups exist
 * (owner spec: "keep it to 4 max for a big readable board"). Calm,
 * non-blocking notes nudge towards >= 2 groups and >= 2 items per group
 * (`gameModes.ts`'s own eligibility rule) rather than hard-blocking anything
 * — exactly like `MatchPairsEditor`'s own "Agrega al menos 3 parejas" note.
 */
import { useEffect, useRef } from 'react';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/ssr/SquaresFour';
import { cn } from '@/lib/utils';
import { MAX_GROUPSORT_GROUPS, MIN_GROUPSORT_ITEMS_PER_GROUP, type GroupSortGroupRow } from '@/lib/activities/groupSort';
import {
  AddCard,
  Chip,
  ChipInput,
  Footnote,
  RowRemoveButton,
  SheetHeader,
  StatusNote,
  TemplateCollapse,
  TemplateField,
  TemplateGroup,
  useExitingItems,
} from './TemplateEditorKit';

export const COPY = {
  es: {
    title: 'Ordenar por grupos',
    instruction: 'Nombra cada grupo y escribe los elementos que le pertenecen.',
    groupNameLabel: 'Nombre del grupo',
    groupNamePlaceholder: 'Ej. Animales',
    itemPlaceholder: '+ elemento',
    addItem: (n: number) => `Agregar elemento al grupo ${n}`,
    removeItem: 'Quitar elemento',
    removeGroup: 'Quitar este grupo',
    addGroup: 'Agregar grupo',
    minGroupsHint: 'Agrega al menos 2 grupos',
    minItemsHint: (n: number) => `Agrega al menos ${n} elementos`,
    maxGroupsHint: `Máximo ${MAX_GROUPSORT_GROUPS} grupos, para que el tablero se lea bien`,
    ready: (n: number) => `Listo para jugar · ${n} grupos`,
  },
  en: {
    title: 'Sort into groups',
    instruction: 'Name each group and write the items that belong to it.',
    groupNameLabel: 'Group name',
    groupNamePlaceholder: 'E.g. Animals',
    itemPlaceholder: '+ item',
    addItem: (n: number) => `Add an item to group ${n}`,
    removeItem: 'Remove item',
    removeGroup: 'Remove this group',
    addGroup: 'Add group',
    minGroupsHint: 'Add at least 2 groups',
    minItemsHint: (n: number) => `Add at least ${n} items`,
    maxGroupsHint: `Up to ${MAX_GROUPSORT_GROUPS} groups, so the board stays easy to read`,
    ready: (n: number) => `Ready to play · ${n} groups`,
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

/** Each group's dot, by order — the same pop accents the desk uses (4 max, one each). */
const GROUP_DOT_CLASS = ['bg-pop-sky', 'bg-pop-yellow', 'bg-pop-red', 'bg-pop-green'] as const;

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
  const exits = useExitingItems(onRemove);

  useEffect(() => {
    if (!focusSlotId) return;
    nameRefs.current[focusSlotId]?.focus();
  }, [focusSlotId]);

  const canAddMore = groups.length < MAX_GROUPSORT_GROUPS;
  const ready = groups.length >= 2 && groups.every((g) => g.items.length >= MIN_GROUPSORT_ITEMS_PER_GROUP);

  return (
    <div data-testid={`groupsort-editor-${blockId}`} className="flex flex-col">
      <SheetHeader icon={SquaresFourIcon} tone="green" title={t.title} instruction={t.instruction} />

      <div data-testid={`groupsort-list-${blockId}`} className="flex flex-col gap-3">
        {groups.map((group, index) => (
          <TemplateCollapse key={group.rowId} leaving={exits.isLeaving(group.rowId)}>
            <TemplateGroup
              ariaLabel={group.label.trim() || `${t.groupNameLabel} ${index + 1}`}
              testId={`groupsort-group-${group.slotId}`}
              className="template-card"
            >
              <div className="template-row flex items-center pl-4">
                <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', GROUP_DOT_CLASS[index % 4])} />
                <TemplateField
                  ref={(node) => {
                    nameRefs.current[group.slotId] = node;
                  }}
                  aria-label={`${t.groupNameLabel} ${index + 1}`}
                  placeholder={t.groupNamePlaceholder}
                  data-testid={`groupsort-name-${group.slotId}`}
                  value={group.label}
                  onChange={(event) => onLabelChange(group.slotId, event.target.value)}
                  className="flex-1 font-semibold"
                />
                <div className="flex w-9 shrink-0 justify-end pr-3">
                  <RowRemoveButton
                    label={`${t.removeGroup} ${index + 1}`}
                    testId={`groupsort-remove-group-${group.slotId}`}
                    onRemove={() => exits.remove(group.rowId, group.rowId)}
                  />
                </div>
              </div>

              <div className="template-row flex flex-wrap items-center gap-1.5 px-4 py-3">
                <div data-testid={`groupsort-items-${group.slotId}`} className="contents">
                  {group.items.map((item) => (
                    <Chip
                      key={item.id}
                      testId={`groupsort-item-${item.id}`}
                      removeLabel={`${t.removeItem} ${item.text}`}
                      removeTestId={`groupsort-remove-item-${item.id}`}
                      onRemove={() => onRemoveItem(group.slotId, item.id)}
                    >
                      {item.text}
                    </Chip>
                  ))}
                </div>
                <ChipInput
                  placeholder={t.itemPlaceholder}
                  ariaLabel={t.addItem(index + 1)}
                  testId={`groupsort-item-input-${group.slotId}`}
                  onCommit={(text) => onAddItems(group.slotId, text)}
                />
              </div>
            </TemplateGroup>

            {group.items.length < MIN_GROUPSORT_ITEMS_PER_GROUP && (
              <StatusNote tone="warn" testId={`groupsort-min-items-hint-${group.slotId}`}>
                {t.minItemsHint(MIN_GROUPSORT_ITEMS_PER_GROUP)}
              </StatusNote>
            )}
          </TemplateCollapse>
        ))}

        {canAddMore ? (
          <AddCard label={t.addGroup} testId={`groupsort-add-${blockId}`} onClick={onAdd} />
        ) : (
          <Footnote testId={`groupsort-max-groups-hint-${blockId}`}>{t.maxGroupsHint}</Footnote>
        )}
      </div>

      {groups.length < 2 ? (
        <StatusNote tone="warn" testId={`groupsort-min-groups-hint-${blockId}`}>
          {t.minGroupsHint}
        </StatusNote>
      ) : ready ? (
        <StatusNote tone="ready" testId={`groupsort-ready-${blockId}`}>
          {t.ready(groups.length)}
        </StatusNote>
      ) : null}
    </div>
  );
}
