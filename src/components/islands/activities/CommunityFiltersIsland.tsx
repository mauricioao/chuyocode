/**
 * CommunityFiltersIsland — the three fields of the catalog's filter panel
 * (`CommunityFiltersPanel.astro`): Nivel, Tipo and Ordenar por, as the Inglés
 * capsule dropdown (owner approval 2026-11-09; maquette
 * `ChuyoCode_others/propuestas/desplegables`, B2/B3). Each field is its label
 * above a capsule that hugs its value.
 *
 * The panel stays a plain `method="get"` form, so the URL and the server are
 * unchanged: each dropdown submits its current value in its own hidden field
 * (`name`), under the SAME names and values the native selects sent — `nivel`
 * (`""` for "Todos los niveles"), `tipo` (`""` for "Todos") and `orden`. The
 * dropdowns are controlled, so this island only holds the three values,
 * starting from the ones the page read from the query (so the server render
 * already shows them).
 *
 * `sheetOnPhone={false}`: below `lg` the panel itself is already the bottom
 * sheet (`.filters-panel`'s own media query, the same 1024px breakpoint as
 * `useIsDesktop`), so each list opens anchored inside it — never a sheet on a
 * sheet (maquette section E, "Dónde se usa").
 */
import { useState, type ReactNode } from 'react';
import type { Level } from '@/lib/exerciseTaxonomy';
import type { Lang } from '@/lib/i18n';
import { CapsuleSelect } from '@/components/ui/CapsuleSelect';
import { LevelSelect } from '@/components/ui/LevelSelect';

export interface FilterOption {
  value: string;
  label: string;
}

export interface CommunityFiltersIslandProps {
  lang: Lang;
  /** The current `?nivel=`, `null` for every level. */
  level: Level | null;
  /** The current `?tipo=`, `""` for every type. */
  type: string;
  /** The current `?orden=`. */
  sort: string;
  levelLabel: string;
  /** The level list's none option ("Todos los niveles"). */
  allLevelsLabel: string;
  typeLabel: string;
  typeOptions: FilterOption[];
  sortLabel: string;
  sortOptions: FilterOption[];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  // The visible label is decorative for assistive tech: each capsule already
  // carries the same words as its accessible name.
  return (
    <div data-filters-field="" className="flex flex-col items-start gap-1.5">
      <span aria-hidden="true" className="text-[13px] leading-4 font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

export function CommunityFiltersIsland({
  lang,
  level: initialLevel,
  type: initialType,
  sort: initialSort,
  levelLabel,
  allLevelsLabel,
  typeLabel,
  typeOptions,
  sortLabel,
  sortOptions,
}: CommunityFiltersIslandProps) {
  const [level, setLevel] = useState<Level | null>(initialLevel);
  const [type, setType] = useState(initialType);
  const [sort, setSort] = useState(initialSort);

  return (
    <>
      <Field label={levelLabel}>
        <LevelSelect
          lang={lang}
          label={levelLabel}
          noneLabel={allLevelsLabel}
          value={level}
          onValueChange={setLevel}
          name="nivel"
          sheetOnPhone={false}
          testId="filters-level"
        />
      </Field>
      <Field label={typeLabel}>
        <CapsuleSelect
          label={typeLabel}
          groups={[{ options: typeOptions }]}
          value={type}
          onValueChange={setType}
          name="tipo"
          sheetOnPhone={false}
          testId="filters-type"
        />
      </Field>
      <Field label={sortLabel}>
        <CapsuleSelect
          label={sortLabel}
          groups={[{ options: sortOptions }]}
          value={sort}
          onValueChange={setSort}
          name="orden"
          sheetOnPhone={false}
          testId="filters-sort"
        />
      </Field>
    </>
  );
}
