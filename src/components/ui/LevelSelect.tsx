/**
 * LevelSelect — the level variant of the Inglés dropdown pattern
 * (`CapsuleSelect`; owner approval 2026-11-09, maquette
 * `ChuyoCode_others/propuestas/desplegables`, A3/A4/C/D/E).
 *
 *  - Options: a none option first (the caller's own words: "Sin nivel" in the
 *    editor, "Todos los niveles" in the catalog), then the six CEFR levels by
 *    their full names ("Básico A1 … Avanzado C2", `UI_LABELS.english.levels`).
 *  - The three tiers are named groups split by thin lines — no visible
 *    headers: every name already starts with its tier.
 *  - `LevelBars`, the desk dock's ascending bars in miniature, leads every row
 *    and the trigger: A1 fills one bar … C2 six, none fills nothing.
 *
 * Value: a `Level`, or `null` for the none option. Inside a form (`name`), the
 * bare code is submitted — `""` for none, like the catalog's native select.
 */
import { useMemo } from 'react';
import { LEVELS, isLevel, type Level } from '@/lib/exerciseTaxonomy';
import { UI_LABELS, levelBand, type Lang } from '@/lib/i18n';
import { filledBarCount, levelTier, miniBarHeights, type LevelTier } from '@/lib/ui/levelBars';
import { cn } from '@/lib/utils';
import { CapsuleSelect, type CapsuleSelectGroup, type CapsuleSelectProps } from './CapsuleSelect';

/** 17 × 16 px: six 2px bars, 1px apart, round 1px tips (spec E). */
const ICON_HEIGHT = 16;
const BAR_WIDTH = 2;
const BAR_STEP = 3;
const BAR_HEIGHTS = miniBarHeights(ICON_HEIGHT).map((h) => Math.round(h * 100) / 100);

/**
 * Each tier in the DARK tone of its dock colour — the dock's light mint/sky
 * vanish as 2px bars on white (1.5:1 and 2:1, maquette section C). Empty bars
 * are `--border`: decorative, the name beside them already says the level.
 */
const TIER_FILL_CLASS: Record<LevelTier, string> = {
  A: 'fill-pop-mint-deep',
  B: 'fill-pop-sky-deep',
  C: 'fill-pop-violet',
};

export function LevelBars({ level, className }: { level: Level | null; className?: string }) {
  const filled = filledBarCount(level);
  const fillClass = level ? TIER_FILL_CLASS[levelTier(level)] : '';
  return (
    <svg
      data-slot="level-bars"
      viewBox={`0 0 ${BAR_STEP * (BAR_HEIGHTS.length - 1) + BAR_WIDTH} ${ICON_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
      className={cn('h-4 w-[17px] shrink-0', className)}
    >
      {BAR_HEIGHTS.map((height, index) => {
        const isFilled = index < filled;
        return (
          <rect
            key={index}
            x={index * BAR_STEP}
            y={ICON_HEIGHT - height}
            width={BAR_WIDTH}
            height={height}
            rx={1}
            className={isFilled ? fillClass : 'fill-border'}
            data-filled={isFilled ? '' : undefined}
          />
        );
      })}
    </svg>
  );
}

function levelGroups(lang: Lang, noneLabel: string): CapsuleSelectGroup[] {
  const names = UI_LABELS[lang].english.levels;
  const tiers = new Map<LevelTier, Level[]>();
  for (const level of LEVELS) {
    const tier = levelTier(level);
    tiers.set(tier, [...(tiers.get(tier) ?? []), level]);
  }
  return [
    { options: [{ value: '', label: noneLabel, icon: <LevelBars level={null} /> }] },
    ...[...tiers.values()].map((levels) => ({
      label: levelBand(lang, levels[0]!),
      options: levels.map((level) => ({ value: level, label: names[level], icon: <LevelBars level={level} /> })),
    })),
  ];
}

export interface LevelSelectProps
  extends Omit<CapsuleSelectProps, 'groups' | 'value' | 'onValueChange' | 'placeholder'> {
  lang: Lang;
  value: Level | null;
  onValueChange: (level: Level | null) => void;
  /** The none option's words: "Sin nivel" (editor) or "Todos los niveles" (catalog). */
  noneLabel: string;
}

export function LevelSelect({ lang, value, onValueChange, noneLabel, ...rest }: LevelSelectProps) {
  const groups = useMemo(() => levelGroups(lang, noneLabel), [lang, noneLabel]);
  return (
    <CapsuleSelect
      {...rest}
      groups={groups}
      value={value ?? ''}
      onValueChange={(next) => onValueChange(isLevel(next) ? next : null)}
    />
  );
}
