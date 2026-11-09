/**
 * CapsuleSelect — the ONE dropdown pattern of the Inglés product (owner
 * approval 2026-11-09; visual reference and spec: the maquette
 * `ChuyoCode_others/propuestas/desplegables/index.html`, section E).
 *
 *  - Trigger: a white 34px capsule that hugs its text (never stretched), with
 *    a chevron that flips while open — same family as the preview's "Fondo"
 *    button. A `row` variant renders the same control as a full-width menu row
 *    ("Nivel · Intermedio B1"), for a trigger that lives inside a menu.
 *  - Desktop: Radix Select (`radix-ui`), so the combobox/listbox roles,
 *    typeahead, ↑/↓/Home/End, Enter/Space, Esc and focus return come from
 *    Radix. The panel is OPAQUE white, not glass: text on glass dropped below
 *    4.5:1 in the maquette's section C.
 *  - Phone (below `lg`, the editor's own phone breakpoint — `useIsDesktop`):
 *    the options open in the existing `BottomSheet`, as a listbox of option
 *    buttons. This replaces the native phone picker for these controls (owner
 *    decision 2026-11-09). `sheetOnPhone={false}` keeps the anchored list for
 *    a caller that already lives in a sheet — never a sheet on a sheet.
 *
 * Every visual rule lives in `src/styles/global.css` under the Inglés scope,
 * keyed off the `data-slot`s below (same posture as the Inglés button kit).
 *
 * EMPTY VALUES: `""` is an ordinary option value here ("Todos los niveles",
 * "Sin nivel"). Radix reserves `""` for "nothing chosen", so it only ever sees
 * a private stand-in — callers never do.
 *
 * FORMS: pass `name` and a hidden field carries the CURRENT value (the real
 * one, `""` included) under that name — not Radix's own hidden `<select>`,
 * which would carry the stand-in for `""` instead.
 */
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { CaretDownIcon } from '@phosphor-icons/react/dist/ssr/CaretDown';
import { CheckIcon } from '@phosphor-icons/react/dist/ssr/Check';
import BottomSheet from '@/components/ui/BottomSheet';
import { useHydrated } from '@/hooks/useHydrated';
import { useIsDesktop } from '@/hooks/useIsDesktop';

export interface CapsuleSelectOption {
  value: string;
  label: string;
  /** Decorative (`aria-hidden`), shown before the label in the row AND in the trigger once chosen. */
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * A run of options. Groups are split by a thin line; a `label` names the
 * group for assistive tech (`role="group"`) without a visible header.
 */
export interface CapsuleSelectGroup {
  label?: string;
  options: CapsuleSelectOption[];
}

export interface CapsuleSelectProps {
  /** Accessible name of the control (and the sheet's title on a phone). */
  label: string;
  groups: CapsuleSelectGroup[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  /** Inside a `<form>`: submit the current value under this name. */
  name?: string;
  /** The `form` attribute of that hidden field, for a select rendered outside its form. */
  form?: string;
  /** Shown (muted) when `value` matches no option. */
  placeholder?: string;
  /** `capsule` (default) or a full-width `row` with the label on its left, for menus. */
  variant?: 'capsule' | 'row';
  /** Panel alignment under the trigger: `end` docks it to the trigger's right edge (a trigger near the window's edge). */
  align?: 'start' | 'end';
  /** `false`: keep the anchored list on phones too (the caller already lives in a sheet). */
  sheetOnPhone?: boolean;
  testId?: string;
  /** Extra classes for the trigger (layout only — never a width). */
  className?: string;
}

const EMPTY_VALUE = '__capsule-select-empty__';
const toRadixValue = (value: string) => (value === '' ? EMPTY_VALUE : value);
const fromRadixValue = (value: string) => (value === EMPTY_VALUE ? '' : value);

function findOption(groups: CapsuleSelectGroup[], value: string): CapsuleSelectOption | undefined {
  for (const group of groups) {
    const match = group.options.find((option) => option.value === value);
    if (match) return match;
  }
  return undefined;
}

function TriggerContent({
  label,
  selected,
  placeholder,
  variant,
}: {
  label: string;
  selected: CapsuleSelectOption | undefined;
  placeholder?: string;
  variant: 'capsule' | 'row';
}) {
  return (
    <>
      {variant === 'row' && <span data-slot="capsule-select-row-label">{label}</span>}
      <span data-slot="capsule-select-value">
        {selected?.icon && (
          <span data-slot="capsule-select-icon" aria-hidden="true">
            {selected.icon}
          </span>
        )}
        <span data-slot="capsule-select-text" data-placeholder={selected ? undefined : ''}>
          {selected ? selected.label : (placeholder ?? '')}
        </span>
      </span>
      <CaretDownIcon data-slot="capsule-select-caret" aria-hidden="true" size={14} weight="bold" />
    </>
  );
}

/** Thin line between groups — decorative, so it never shows up as a listbox child. */
function Separator({ radix }: { radix: boolean }) {
  return radix ? (
    <SelectPrimitive.Separator data-slot="capsule-select-separator" />
  ) : (
    <div data-slot="capsule-select-separator" aria-hidden="true" />
  );
}

function PopoverSelect({
  label,
  groups,
  value,
  onValueChange,
  disabled,
  placeholder,
  variant,
  align,
  testId,
  className,
  selected,
}: Required<Pick<CapsuleSelectProps, 'label' | 'groups' | 'value' | 'onValueChange' | 'variant' | 'align'>> &
  Pick<CapsuleSelectProps, 'disabled' | 'placeholder' | 'testId' | 'className'> & {
    selected: CapsuleSelectOption | undefined;
  }) {
  // Which input drives the open list. Radix focuses a row on hover AND on the
  // arrows, and Chrome reports that programmatic focus as `:focus-visible`
  // either way — so `:focus-visible` cannot tell "hover" (soft grey) from
  // "keyboard" (grey + 2px ring). The list carries `data-input` instead.
  const [inputMode, setInputMode] = useState<'keyboard' | 'pointer'>('pointer');
  return (
    <SelectPrimitive.Root
      value={toRadixValue(value)}
      onValueChange={(next) => onValueChange(fromRadixValue(next))}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        data-slot="capsule-select-trigger"
        data-variant={variant}
        data-testid={testId}
        aria-label={label}
        className={className}
        onKeyDown={() => setInputMode('keyboard')}
        onPointerDown={() => setInputMode('pointer')}
      >
        <TriggerContent label={label} selected={selected} placeholder={placeholder} variant={variant} />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        {/* `data-theme` on the panel itself: portaled to <body>, it still
            renders as the Inglés panel on a page that is not Inglés-themed
            (the moderators' living kit, `/admin/ui`). Placement per spec:
            8px below the trigger; aligned to its start, with the first icon
            in the trigger's icon column (the 4px panel padding), or to its
            end; height capped at the free space minus 16px, then scroll. */}
        <SelectPrimitive.Content
          data-slot="capsule-select-content"
          data-theme="ingles"
          position="popper"
          side="bottom"
          sideOffset={8}
          align={align}
          alignOffset={align === 'start' ? -4 : 0}
          collisionPadding={16}
          data-input={inputMode}
          onKeyDown={() => setInputMode('keyboard')}
          onPointerMove={() => setInputMode('pointer')}
        >
          <SelectPrimitive.Viewport data-slot="capsule-select-viewport">
            {groups.map((group, index) => {
              const items = group.options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={toRadixValue(option.value)}
                  textValue={option.label}
                  disabled={option.disabled}
                  data-slot="capsule-select-item"
                >
                  {option.icon && (
                    <span data-slot="capsule-select-icon" aria-hidden="true">
                      {option.icon}
                    </span>
                  )}
                  <SelectPrimitive.ItemText data-slot="capsule-select-item-text">{option.label}</SelectPrimitive.ItemText>
                  <span data-slot="capsule-select-check">
                    <SelectPrimitive.ItemIndicator>
                      <CheckIcon aria-hidden="true" size={16} weight="bold" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                </SelectPrimitive.Item>
              ));
              return (
                <Fragment key={index}>
                  {index > 0 && <Separator radix />}
                  {group.label ? (
                    <SelectPrimitive.Group>
                      <SelectPrimitive.Label className="sr-only">{group.label}</SelectPrimitive.Label>
                      {items}
                    </SelectPrimitive.Group>
                  ) : (
                    items
                  )}
                </Fragment>
              );
            })}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

const SHEET_NAVIGATION_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

function SheetSelect({
  label,
  groups,
  value,
  onValueChange,
  disabled,
  placeholder,
  variant,
  testId,
  className,
  selected,
}: Required<Pick<CapsuleSelectProps, 'label' | 'groups' | 'value' | 'onValueChange' | 'variant'>> &
  Pick<CapsuleSelectProps, 'disabled' | 'placeholder' | 'testId' | 'className'> & {
    selected: CapsuleSelectOption | undefined;
  }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus goes back to the trigger once the sheet closes (chosen, Esc, tap
  // outside or swipe down). `BottomSheet` has no Radix `Dialog.Trigger` to
  // return to, so this owns it — after the close render, when the sheet's
  // focus trap has already let go.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  function choose(option: CapsuleSelectOption) {
    if (option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
  }

  // The sheet's options are buttons (Tab works on its own); ↑/↓/Home/End
  // move between the enabled ones too, like the desktop list.
  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!SHEET_NAVIGATION_KEYS.includes(event.key)) return;
    const options = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [])];
    if (options.length === 0) return;
    event.preventDefault();
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key === 'ArrowDown'
            ? Math.min(options.length - 1, current + 1)
            : Math.max(0, current - 1);
    options[next]?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-slot="capsule-select-trigger"
        data-variant={variant}
        data-state={open ? 'open' : 'closed'}
        data-testid={testId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${selected ? selected.label : (placeholder ?? '')}`}
        disabled={disabled}
        className={className}
        onClick={() => setOpen(true)}
      >
        <TriggerContent label={label} selected={selected} placeholder={placeholder} variant={variant} />
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title={label} testId={testId ? `${testId}-sheet` : undefined}>
        <div
          ref={listRef}
          role="listbox"
          aria-label={label}
          data-slot="capsule-select-sheet"
          onKeyDown={onListKeyDown}
        >
          {groups.map((group, index) => {
            const rows = group.options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled ? true : undefined}
                  disabled={option.disabled}
                  data-slot="capsule-select-item"
                  data-state={isSelected ? 'checked' : 'unchecked'}
                  // The chosen option takes the focus when the sheet opens
                  // (the sheet's focus trap keeps an already-focused child).
                  autoFocus={isSelected && !option.disabled}
                  onClick={() => choose(option)}
                >
                  {option.icon && (
                    <span data-slot="capsule-select-icon" aria-hidden="true">
                      {option.icon}
                    </span>
                  )}
                  <span data-slot="capsule-select-item-text">{option.label}</span>
                  <span data-slot="capsule-select-check">
                    {isSelected && <CheckIcon aria-hidden="true" size={18} weight="bold" />}
                  </span>
                </button>
              );
            });
            return (
              <Fragment key={index}>
                {index > 0 && <Separator radix={false} />}
                {group.label ? (
                  <div role="group" aria-label={group.label}>
                    {rows}
                  </div>
                ) : (
                  rows
                )}
              </Fragment>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}

export function CapsuleSelect({
  label,
  groups,
  value,
  onValueChange,
  disabled = false,
  name,
  form,
  placeholder,
  variant = 'capsule',
  align = 'start',
  sheetOnPhone = true,
  testId,
  className,
}: CapsuleSelectProps) {
  // A real STRUCTURAL branch (Radix listbox vs. bottom sheet), so it pairs
  // `useIsDesktop` with `useHydrated` like the rest of the editor: the server
  // render and the hydration pass always render the Radix version (its
  // trigger looks identical), and a phone swaps to the sheet right after.
  const hydrated = useHydrated();
  const isDesktop = useIsDesktop();
  const useSheet = sheetOnPhone && hydrated && !isDesktop;
  const selected = findOption(groups, value);
  const shared = {
    label,
    groups,
    value,
    onValueChange,
    disabled,
    placeholder,
    variant,
    testId,
    className,
    selected,
  };

  return (
    <>
      {useSheet ? <SheetSelect {...shared} /> : <PopoverSelect {...shared} align={align} />}
      {name ? <input type="hidden" name={name} value={value} form={form} disabled={disabled} /> : null}
    </>
  );
}
