# Exercise Model

The data contract behind the English section. Every exercise — multiple choice, fill-in-the-blank, dropdown, drag-and-drop, listening — is stored in **one table** with **one payload shape** and graded by **one function**.

This document is the source of truth. If code and this document disagree, that is a bug in one of them.

## Quick path

Adding a new exercise **mechanic** (a new way to answer):

1. Write a renderer component.
2. Pick a comparator — `set` or `text`. Those are the two that ship, and a new mechanic almost never needs a third.
3. Add one line to the mechanic registry, and one line to `COMPARATORS`.

No migration. No table change. No change to `check()`. No change to existing exercises.

---

## What ships today

The rest of this document describes the model. This table describes the **build**, and it is the one thing here that goes stale — check it against
`src/components/islands/mechanics/registry.ts` before authoring against it.

| Mechanic (`slot.input`) | Renderer | Comparator | Ships |
|---|---|---|---|
| `choice` | radio group | `set` | ✅ |
| `select` | `<select>` dropdown | `set` | ✅ |
| `text` | typed input | `text` | ✅ |
| `drop` | drag a tile into a box | `set` | ✅ |
| `order` | — | — | ❌ neither renderer nor comparator |
| `hotspot` | — | — | ❌ neither renderer nor comparator |

Optional payload fields, both new and both degrading rather than rejecting:

| Field | Purpose |
|---|---|
| `timer` | A countdown for the whole exercise. See "Timer". |
| `layout` | Where the tile pool sits. See "Pool placement". |

And one behaviour that is not a field at all: a multi-slot exercise is walked **one slot at a time**. See "The stepper".

---

## The two axes

The single most important idea here. Confusing these two produces a combinatorial explosion of exercise types.

| Axis | Field | What it describes | Values |
|---|---|---|---|
| **Stimulus** | `payload.media` | What the learner perceives | text, audio, image, video |
| **Mechanic** | `slot.input` | How the learner answers | `choice`, `text`, `drop`, `select` (shipped), `order`, `hotspot`, … |

**Listening is not an exercise type.** It is an audio stimulus layered on any mechanic. A listening exercise can be multiple choice, fill-in-the-blank, or ordering. Modeling "listening" as a type would force duplicating every answer mechanic inside it.

The same applies to reading and to image-based prompts. `skill` (writing / listening / reading) is a **filter label for the UI**, never a dispatch key.

---

## Focus and topic — what an exercise is *about*

A second pair, and just as easy to collapse. The axes above describe how an exercise WORKS; these two describe what it TEACHES.

| Axis | Field | Question it answers | Values |
|---|---|---|---|
| **Focus** (primary) | `focus` | What am I practising? | `present-simple`, `second-conditional`, `phrasal-verbs`, … |
| **Topic** (secondary) | `topic` | Where does it happen? | `travel`, `food`, `code-review`, … *(nullable)* |

**`topic` was never the subject of an exercise.** It is the vocabulary CONTEXT — the situation the sentences happen to describe. The section originally filed everything under it, which meant the grid answered "where does this happen?" while the question a learner or a teacher actually asks first is "what am I practising?". Nobody looks for *"something set in an airport"*; they look for *"conditionals"*.

So `focus` is the primary axis. It drives the entry grid, the listing route, the deep link and the uniqueness key.

### Why `topic` was kept rather than dropped

*"Present simple, in a food context"* is a better exercise than *"Present simple"*. The setting is what keeps a drill feeling like language instead of grammar homework, and it is the thing that distinguishes several exercises on the same language point. It is now a badge, not a filter.

### Why `topic` is nullable

A pure grammar drill has no natural setting. A `NOT NULL` context column forces the author to invent one, which pollutes the very axis that is supposed to mean something — and an invented context is worse than an absent one, because it is indistinguishable from a real one.

**An absent topic renders NO badge, never an empty one.** An empty bordered chip looks deliberate rather than broken, which makes it the worse failure. Same rule as an unknown `skill`.

### Why `FOCUSES` is a flat list, not a map keyed by level

A language point is genuinely practised at more than one level: `present-simple` is an A1 introduction and again a B1 contrast against the present continuous; `modal-verbs` runs from A2 politeness to C1 hedging. **The level lives on the row.** A `focus -> level` map would make that ordinary case unrepresentable and would need editing every time a point is reused.

The order of `FOCUSES` is roughly ascending difficulty because it is the order the entry grid renders in. That is display convenience only — nothing reads a level out of a position.

---

## Payload shape

Three concepts carry the model. Two optional fields sit beside them.

```jsonc
{
  "media": { "audio": "https://…" },          // optional stimulus
  "timer": { "seconds": 90 },                 // optional countdown
  "layout": { "pool": "top" },                // optional placement hint
  "pools": {
    "food": [
      { "id": "i_olives", "media": "https://…/olives.jpg" },
      { "id": "i_honey",  "media": "https://…/honey.jpg"  }
    ]
  },
  "slots": [
    {
      "id": "olives_img",
      "label": "olives",
      "input": "drop",
      "pool": "food",
      "answer": ["i_olives"]
    }
  ]
}
```

| Key | Required | Purpose |
|---|---|---|
| `slots` | **yes** | The things to answer. Each carries its own `answer`. |
| `pools` | by convention | Named sets of selectable items. A pool is **shared across slots** — declare the 18 food images once, not once per row. A missing `pools` parses as `{}`, but always write it: see below. |
| `media` | no | The stimulus. Presence of `media.audio` is what makes an exercise "listening". |
| `timer` | no | A countdown for the whole exercise. Absence is the normal case. |
| `layout` | no | Where the tile pool sits. Absence means "derive it". |

### Why the answer lives inside the slot

An earlier draft used a separate `key: { slotId: [...] }` map. That allows a key entry whose id matches no slot — a silent bug where an exercise looks gradeable but isn't. Nesting the answer removes that class of error entirely.

### Why `pools` is always used

Even for a plain multiple-choice question with one pool, where inline `choices` would be shorter.

**One code path.** Allowing "sometimes a pool reference, sometimes inline options" forces a branch in every renderer and every validator, forever, for every mechanic added from now on. Three extra characters of JSON is a better trade than a permanent conditional.

### A bad slot kills the exercise; a bad optional field does not

`parsePayload` is the single gate between raw `jsonb` and anything a renderer may trust, and it is deliberately **asymmetric**:

| What is wrong | Outcome |
|---|---|
| No `slots`, or `slots` is empty | Whole payload rejected → the page 404s |
| Any slot missing `id` or `input` | Whole payload rejected → the page 404s |
| Any slot with an empty `answer` | Whole payload rejected → the page 404s |
| A malformed `timer` | Timer dropped. Exercise renders untimed. |
| A malformed `layout` | Hint dropped. Placement falls back to the derived default. |
| A pool item without an `id` | That item dropped. The rest of the pool survives. |
| A slot naming a pool that does not exist | That slot gets `[]` items. The exercise still renders. |
| An `input` no renderer knows | That slot degrades alone. See "Why this cannot break existing exercises". |

The rule behind the split: **a broken slot is ungradeable, so drawing it would lie to the learner.** A broken timer just means no clock, and a broken layout hint just means the tiles sit where they would have sat anyway — turning a typo in an optional field into a 404 on real content is the worse trade.

The first three rows are the ones that bite authors. One slot with a forgotten `answer` takes down the *entire* exercise, not that slot — which is why "every slot has a non-empty `answer`" is the first line of the authoring rules.

---

## Stable ids, never positions

**Answers reference item ids. Never array positions.**

```jsonc
"answer": ["i_olives"]   // correct
"answer": [2]            // NEVER
```

Positional answers break silently the moment options are shuffled, reordered, inserted, or deleted. The learner answers correctly and is told they are wrong — the worst possible failure mode for a learning platform, because nothing throws and nothing logs.

Stable ids also unlock **shuffling options on every render**, which matters: without it, learners memorize positions instead of the language.

---

## Timer

Optional. A countdown for the **whole exercise**.

```jsonc
"timer": { "seconds": 90 }
```

| Rule | Behaviour |
|---|---|
| Absent | Untimed. This is the normal case and a complete experience. |
| `seconds` is not a finite number | Dropped → untimed. |
| `seconds` floors below `1` (`0`, `0.4`, `-5`) | Dropped → untimed. |
| Fractional (`90.7`) | Floored to `90`. |
| Valid | Counts down from mount. On zero, the exercise grades itself. |

### Why it is payload data and not a column

A time limit is an authoring choice per exercise, and the overwhelming majority of exercises will never carry one. A column would put a nullable integer on every row to describe a rare case, and would need a migration the first time the shape grows a second field (a grace period, a per-slot limit). `jsonb` costs nothing for the exercises that omit it.

### Why it is exercise-level and never slot-level

Slots grade independently but they are **answered together**. A per-slot clock would mean several countdowns racing on one page with nothing to tell the learner which one is about to fire.

### Why zero is rejected rather than clamped

A zero-second timer fires on mount and grades the exercise before the learner has read the first word — an exercise nobody can answer. Silently dropping to "untimed" is strictly better than shipping that.

### What the clock does while the learner reads feedback

It **pauses**, and resumes on retry. The clock measures time spent *answering*; reading a verdict is not answering, and letting it drain while the learner reads would punish them for looking at the feedback we just asked them to look at.

---

## Pool placement

Optional. Where a mechanic's tile pool sits relative to the prompt it answers.

```jsonc
"layout": { "pool": "top" }
```

Accepted values: `bottom`, `top`, `left`, `right`. **Presentation only** — grading never sees this, and no comparator changes shape because of it.

### The derived default

When `layout` is absent (or unreadable), placement is derived from the one fact the content already gives us — **how many things there are to answer**:

| Slots | Derived placement | Why |
|---|---|---|
| 1 | `bottom` | The sentence leads and the options sit under it: the reading order of every worksheet ever printed. |
| 2 or more | `top` | The pool is SHARED between slots, so it must be reachable from any of them. Anchoring it above the prompt keeps it in one fixed place instead of moving as prompts of different heights come and go. |

`left` and `right` are **explicit-only**. A side pool is only usable when there is a large block on the other side to balance it, and nothing in the payload says whether there is — an author can see that, a slot count cannot. Guessing it would produce a column of tiles beside a six-word sentence, which is worse than the default it replaced.

Side placements also **collapse to a stack below `sm`**. At 320px there is no other side.

### Why an unknown string is rejected rather than passed through

The value reaches a lookup table of class names. An unrecognised key there would render a pool with no layout classes at all — a visibly broken exercise instead of a default one.

### Why the placement is resolved once, for the whole exercise

Placement is a property of the **exercise** (its authored hint, or its slot count), not of a renderer. Deriving it per renderer is how two pools on one page end up on two different sides after an edit touches only one of them.

---

## The `drop` rules

`drop` is drag-a-tile-into-a-gap. It reports the dropped **item id**, exactly like `choice` and `select`, which is why it reuses the `set` comparator instead of growing a new one. Grading never learns that a drag happened.

Two rules define the whole mechanic. Both follow from one idea: **the pool is derived, never stored.**

A tile is "in the pool" precisely when no slot's answer names it. There is no second list of remaining tiles to keep in sync — which is the bug this design removes rather than guards against.

### Rule 1 — a placed tile leaves the pool

Placing a tile consumes it. It is subtracted from the pool of every `drop` slot in the exercise, not only the one it landed in, because **pools are shared across slots**. Without that, two `drop` slots reading one pool would each offer the same tile and the learner could answer with it twice — and nothing would throw and nothing would log.

Consumption is scoped to `drop` slots only. A pool may back two mechanics at once, and counting a `select` answer as a consumed tile would make picking a dropdown option silently delete a draggable tile from an unrelated question.

### Rule 2 — dropping onto an occupied slot returns the resident to the pool

The incoming tile wins; the tile that was there goes back to the pool. **Not a swap.**

A swap needs two boxes to exchange contents, but the incoming tile usually comes from the pool, which has no box to receive the displaced tile in return. So "swap" is undefined for the common case and would need a second, different rule for it. Returning the resident to the pool is the one rule that reads identically no matter where the incoming tile came from, and it never destroys an answer: the displaced tile is immediately available again, one square away.

Rejecting the drop while the box is occupied was considered and rejected — it makes the learner hunt for a remove control before they can correct a mistake, and a drop that visibly lands and then silently does nothing is worse than either.

Re-dropping the tile already in the box is a no-op, and nothing is displaced.

### What this means for authoring

| | |
|---|---|
| Pool size vs. slot count | A pool with exactly as many tiles as `drop` slots is a process-of-elimination puzzle. Add distractors if you do not want that. |
| Removing an answer | Clicking a placed tile empties its box and returns the tile. The box is not draggable — one element, one keyboard meaning. |
| Image tiles | A tile with `media` and no `text` is named by its `id` for screen readers. Give image tiles a readable `text` too when the word is not a spoiler. |
| Keyboard | Space/Enter to pick up, arrows to move, Space/Enter to drop, Escape to cancel. Authored content needs to do nothing for this. |

---

## The stepper

**A multi-slot exercise is a sequence, not a wall of questions.**

When an exercise has **two or more slots**, only one slot is on screen at a time, with Previous / Next controls and a "2 of 5" position. A single-slot exercise gets no stepper at all — "1 of 1" beside two dead arrows is chrome that describes itself and does nothing.

| Property | Behaviour |
|---|---|
| Threshold | 2 slots or more |
| Order | `payload.slots` order, verbatim. The array *is* the sequence the learner walks. |
| Ends | Clamped, not wrapped. "Next" on the last slot does nothing rather than sending the learner back to question one. |
| Grading | Unchanged — the whole exercise is graded at once, and the stepper never grades, never clears an answer, and is never disabled by grading. |
| After grading | The learner can walk back through every slot and read each verdict. |
| On "Fix" | The exercise jumps to the first incorrect slot and focuses its control. |

### What this changes for authoring

This is the biggest authoring change in the model, and it is a change of *scale*, not of contract.

Before the stepper, an exercise with eight slots rendered as eight stacked questions — a form, and an intimidating one, so exercises stayed short and single-mechanic. With the stepper, the same eight slots read as an **activity**: one question, answer it, next.

So the practical guidance inverts:

- **Longer, mixed exercises are now the target**, not the exception. Six to ten slots is comfortable.
- **Mix mechanics inside one exercise.** A `drop`, then a `text`, then a `choice` is now a varied activity rather than a visually inconsistent wall. Per-slot dispatch always allowed this; the stepper is what makes it *read* well.
- **Slot order is authored pacing.** Put the concrete recognition tasks early and the productive ones later, the way a lesson escalates.

### Why the stepper is not navigation

There is no URL, no query and no page transition. The stepper walks the questions *inside* one exercise; the answers it walks past live in the island's response state, so stepping cannot lose an answer because stepping does not own any.

---

## Grading

One function. Every mechanic.

```ts
function check(
  payload: Payload,
  response: ExerciseResponse,
  comparatorFn = comparatorFor,
): GradeResult {
  const slots: Record<string, SlotOutcome> = {};
  let correct = true;

  for (const slot of payload.slots) {
    const comparator = comparatorFn(slot.input);
    if (!comparator) {
      slots[slot.id] = 'unavailable';   // excluded from the verdict
      continue;
    }
    const outcome = gradeSlot(slot, response[slot.id] ?? [], comparator);
    slots[slot.id] = outcome;
    if (outcome !== 'correct') correct = false;
  }

  return { correct, slots };
}
```

Every slot is graded independently, which is what allows a single exercise to mix mechanics.

### Comparators

Four shipped mechanics collapse to **two** comparators. The comparator is **not** the axis that grows — the renderer is. That is why the extension point is the renderer.

| Mechanic | Response shape | Comparator | Ships |
|---|---|---|---|
| `choice` — multiple choice | `["b"]` | `set` | ✅ |
| `select` — dropdown | `["q_some"]` | `set` | ✅ |
| `drop` — drag and drop | `["i_olives"]` | `set` | ✅ |
| `text` — fill in the blank | `["sits"]` | `text` (normalized) | ✅ |
| `order` — ordering | `["c","a","b"]` | `sequence` | ❌ not implemented |
| `hotspot` | `[{x,y}]` | `proximity` | ❌ not implemented |

`drop` reusing `set` is the point rather than a shortcut: the mechanic is how the learner *reports* an id, never how an id is *judged*. A tile dragged into a box and an option picked from a dropdown both produce `["i_honey"]`, so they must produce the same verdict.

Text normalization trims the edges and lowercases; inner spacing is preserved so multi-word answers stay distinguishable. Multiple accepted answers go in the same array: `"answer": ["sits", "is sitting"]`, and **any one of them satisfies the slot** — it is a list of alternatives, not a required set.

### `unavailable` — the third outcome

A slot whose mechanic has not shipped is reported `unavailable` and **excluded from the verdict** rather than marked wrong.

Content and code deploy through different pipelines and will drift. An exercise authored for a renderer that has not shipped must degrade that slot alone — penalizing the learner for our deployment gap would be the worse bug. The consequence is worth stating plainly: an exercise can report "all correct" while one of its slots was never gradeable at all.

### A slot is graded only if it was drawn

The comparator map is allowed to be **wider** than the renderer registry, because a comparator is cheap and a renderer is not, so one routinely lands first. Grading against the comparator map alone would show the learner no input for such a slot and then mark it `incorrect` — permanently wrong, for an answer they were never given the chance to give. Nothing throws, nothing logs.

So the island grades through `comparatorForRenderable`, which resolves a comparator **only if that mechanic also renders**. The invariant is structural rather than a promise, and every future mechanic inherits it for free.

### `slot.ordered` is parsed but inert

`ordered: true` is carried through the payload boundary and reaches the `Slot` type. **Nothing reads it.** There is no `sequence` comparator and no `order` renderer, so an `order` slot grades `unavailable` regardless of the flag.

It stays in the contract because it is the flag the `sequence` comparator will read the day ordering ships, and because authored content carrying it costs nothing today. Do not author `order` slots expecting them to grade.

---

## Adding a mechanic

A mechanic is one renderer component honouring the shared props contract (`MechanicRendererProps`) — the only genuinely new code:

```ts
export default function HotspotRenderer(props: MechanicRendererProps) { … }
```

Plus one line in the registry (`src/components/islands/mechanics/registry.ts`), which maps the `slot.input` discriminator to that component:

```ts
const MECHANICS: Record<string, MechanicRenderer> = {
  choice: ChoiceRenderer,
  drop: DropRenderer,
  select: SelectRenderer,
  text: TextRenderer,
};
```

And one line in `COMPARATORS` (`src/lib/exerciseGrading.ts`), reusing an existing comparator whenever possible:

```ts
export const COMPARATORS: Record<string, Comparator> = {
  choice: 'set',
  drop: 'set',
  select: 'set',
  text: 'text',
};
```

Two maps rather than one object per mechanic, because the two are allowed to be out of step: a comparator is cheap and lands early, a renderer is expensive and lands later. `comparatorForRenderable` is what makes that gap safe (see "A slot is graded only if it was drawn").

Slot *shape* is not validated per mechanic. There is one central gate — `parsePayload` — and every mechanic goes through it. A per-mechanic schema would be a second place a slot can be rejected, and the two would drift.

**Props are uniform across every mechanic.** A renderer that has no use for `placeholder`, `claimed`, `lang` or `poolPlacement` simply ignores it. That uniformity is what keeps the registry's dispatch free of a branch per mechanic.

### Why this cannot break existing exercises

This is structural, not a promise:

1. **Existing rows never reference the new `input` value.** They are untouched data. Adding a key to an object does not alter the other keys.
2. **Dispatch is per slot, not per exercise.** A mixed exercise with a `drop` slot and a `select` slot is unaffected by registering `hotspot`.
3. **An unknown `input` degrades that slot only.** The rest of the exercise still renders and still grades.

Point 3 is what keeps production safe: content and code deploy through different pipelines and *will* drift out of sync. An exercise authored for a renderer that has not shipped yet must not take the page down.

---

## Storage

One table. **Columns for what you filter by, `jsonb` for what you render.**

```sql
create table exercises (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,        -- URL segment; see "Deep links" below
  skill       text not null,        -- writing | listening | reading (filter label)
  level       text not null,        -- CEFR: A1 A2 B1 B2 C1 C2
  focus       text not null,        -- PRIMARY axis: the language point
  topic       text,                 -- SECONDARY axis: the context. NULLABLE.
  payload     jsonb not null default '{}',
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),  -- maintained by trigger
  updated_by  uuid references auth.users(id),

  unique (level, focus, slug)
);

create index on exercises (level, focus) where published;

-- A listening exercise without audio is unplayable. Reject at the source.
alter table exercises add constraint listening_requires_audio
  check (
    skill <> 'listening'
    or coalesce(payload->'media'->>'audio', '') <> ''
  );
```

### Decisions worth remembering

| Decision | Why |
|---|---|
| One table, not normalized `slots` / `pools` / `answers` tables | An exercise is always read whole. Normalizing adds three joins for zero benefit. |
| Mechanics live in **code**, not a `mechanics` table | Adding one requires a deploy anyway (the renderer). A table would buy nothing and cost a join. |
| `payload` as `jsonb` | A new mechanic needs zero migrations. GIN-indexable if filtering into the payload ever becomes necessary. |
| Not Sanity | Exercise images are external URLs, so Sanity's asset pipeline adds nothing here. Audit metadata (`updated_by`, `updated_at`) is a native Postgres trigger but lives in document history in Sanity, where it is not queryable. |
| Answer keys ship to the client | Grading is stateless and instant by design, so `answer` is readable in DevTools. Accepted, documented, not hidden. There is no score to protect. |
| `focus` is a column, `topic` is a nullable column | Both are filtered/grouped on — `focus` by the entry grid and the listing, `topic` never. `topic` stays a column anyway because it is rendered on every card and would otherwise be a `jsonb` read for a badge. |

### Adding `focus` to a table that already had rows

`0004_exercises_focus.sql` adds the column **nullable and without a default**, backfills it, and only then sets `NOT NULL`. A plain `add column focus text not null` aborts on a non-empty table.

The alternative — add with a `DEFAULT`, then drop it — was rejected. A default is not merely a migration convenience: while it exists, an `INSERT` that simply *forgot* `focus` succeeds and files that exercise under a real, routable, completely wrong language point. With no default at any point, `NOT NULL` is the real thing and a missing `focus` fails loudly at the source, which is the entire reason the taxonomy is closed.

Rows the migration cannot classify are set to `focus = 'unassigned'` **and unpublished**. The sentinel is deliberately OUTSIDE the taxonomy, so even a hand-republished row fails `isFocus`, gets discarded from the facets, and 404s on the route — rather than being filed under a language point nobody chose. Guessing a real focus would publish an exercise teaching something other than what it claims, which the learner cannot detect and nothing logs.

### Deep links

Exercises are addressed as `/[lang]/ingles/[level]/[focus]/[slug]`. Teachers share individual exercises, so the URL must be stable and readable.

`slug` is unique **per `(level, focus)`**, not globally — the same slug may exist at different levels, which keeps slugs short and human-readable (`spot-the-error` can exist under `present-perfect` and under `passive-voice` without collision).

**`topic` is deliberately NOT in the URL.** It is nullable, so it cannot be a path segment without inventing a "no context" segment; and it is context rather than identity, so it would make the same exercise addressable by a detail that is allowed to be absent.

⚠️ **Changing a published `slug` or `focus` breaks every shared link to it.** Both are in the URL and both are in the uniqueness key. Treat them as permanent once published. This is precisely why the axis moved at ~5 published rows and could not have moved later: the cost of this change is proportional to the number of published deep links.

---

## Media availability

"The audio does not exist" is five different failures. They are detected in different places, at very different costs.

| Failure | Detected | Cost |
|---|---|---|
| No `media.audio` field | Query — the row is already loaded | free |
| Field present but empty | Query | free |
| URL returns 404 | Requires a real HTTP request | **high** |
| Browser cannot decode the file | Client only | client |
| Transient network failure | At playback | must not disable anything permanently |

**Never verify a URL on the render path.** Forty listening cards in a grid would mean forty HEAD requests before the page paints.

The layered approach:

1. **Authoring** — the `listening_requires_audio` constraint above kills the first two cases at the source.
2. **Query** — derive availability from the row you already fetched: `coalesce(payload->'media'->>'audio','') <> '' as has_audio`. Free.
3. **Background** — a periodic job HEAD-checks audio URLs and writes `media_ok` / `media_checked_at` columns. Cards then read a column, never the network. This is the standard defense against link rot.
4. **Client** — the `<audio>` `error` event drives a degraded state on the exercise page.

### Broken media in listings

Prefer **filtering over disabling**:

```sql
where published and (skill <> 'listening' or media_ok)
```

A greyed-out card tells the learner "something was here, and we will not explain what happened" while still consuming grid space. Also note that `<a>` has no `disabled` attribute — faking one requires removing `href` and adding `aria-disabled`, a well-known accessibility antipattern.

The exception is an author-facing view, where a broken exercise **should** be shown, flagged prominently, so it gets fixed.

---

## Worked examples

### Multiple choice

```jsonc
{
  "pools": {
    "opts": [
      { "id": "a", "text": "sit" },
      { "id": "b", "text": "sits" },
      { "id": "c", "text": "sitting" }
    ]
  },
  "slots": [
    { "id": "s1", "label": "The cat ___ on the mat",
      "input": "choice", "pool": "opts", "answer": ["b"] }
  ]
}
```

### Fill in the blank

No pool: the learner types. Multiple accepted answers.

```jsonc
{
  "pools": {},
  "slots": [
    { "id": "s1", "label": "The cat ___ on the mat",
      "input": "text", "answer": ["sits", "is sitting"] }
  ]
}
```

### Listening

Any mechanic plus an audio stimulus. Nothing else changes.

```jsonc
{
  "media": { "audio": "https://…/standup.mp3" },
  "pools": {
    "opts": [
      { "id": "a", "text": "She finished the migration" },
      { "id": "b", "text": "She started the migration" }
    ]
  },
  "slots": [
    { "id": "s1", "label": "What did she say?",
      "input": "choice", "pool": "opts", "answer": ["a"] }
  ]
}
```

### Mixed mechanics in one exercise

**This is the target shape, not an advanced case.** Four slots, four mechanics, one timer, one placement hint. The stepper walks them one at a time, so this reads as an activity rather than a form.

```jsonc
{
  "timer": { "seconds": 120 },
  "layout": { "pool": "top" },
  "pools": {
    "food_images": [
      { "id": "i_olives", "media": "https://…/olives.jpg", "text": "olives" },
      { "id": "i_honey",  "media": "https://…/honey.jpg",  "text": "honey"  },
      { "id": "i_bread",  "media": "https://…/bread.jpg",  "text": "bread"  }
    ],
    "quantifiers": [
      { "id": "q_a",    "text": "a"    },
      { "id": "q_an",   "text": "an"   },
      { "id": "q_some", "text": "some" }
    ]
  },
  "slots": [
    { "id": "s1", "label": "Drag the olives here:", "input": "drop",
      "pool": "food_images", "answer": ["i_olives"] },
    { "id": "s2", "label": "There is ___ honey left in the jar.",
      "input": "select", "pool": "quantifiers", "answer": ["q_some"] },
    { "id": "s3", "label": "We ___ any bread, so I went to the bakery.",
      "input": "text", "answer": ["didn't have", "did not have", "had no"] },
    { "id": "s4", "label": "Drag the bread here:", "input": "drop",
      "pool": "food_images", "answer": ["i_bread"] }
  ]
}
```

Two things are load-bearing here and are easy to miss:

- `s1` and `s4` are both `drop` and both read `food_images`. Once the learner places `i_olives` in `s1`, that tile is **gone from the pool** for `s4` — the pool is shared, and a placed tile leaves it.
- The pool has three tiles for two `drop` slots. `i_honey` is a distractor, so the second `drop` is not answerable by elimination alone.

### Ordering

⚠️ **Not implemented.** There is no `order` renderer and no `sequence` comparator, so a slot like this renders as unavailable and is excluded from the verdict. Kept here because it is the shape the mechanic will take; do not author it.

`ordered: true` is the flag the `sequence` comparator will read when ordering ships. It is carried through the payload boundary today and read by nothing.

```jsonc
{
  "pools": {
    "words": [
      { "id": "w1", "text": "always" },
      { "id": "w2", "text": "she"    },
      { "id": "w3", "text": "arrives" },
      { "id": "w4", "text": "early"  }
    ]
  },
  "slots": [
    { "id": "s1", "label": "Put the words in order",
      "input": "order", "pool": "words", "ordered": true,
      "answer": ["w2", "w1", "w3", "w4"] }
  ]
}
```

---

## Authoring rules

- [ ] Every slot has a non-empty `answer`. **One empty `answer` rejects the whole payload**, not that slot.
- [ ] Every slot's `input` is one of the four that ship: `choice`, `select`, `text`, `drop`.
- [ ] Every id in an `answer` exists in the slot's referenced pool (except `input: "text"`, where answers are literal strings).
- [ ] Pool item ids are unique within their pool and are **never** reused for a different item after publishing — a published id is permanent.
- [ ] A choice-style slot references a pool with at least two items.
- [ ] A `drop` pool has enough tiles for every `drop` slot that shares it, plus distractors if elimination should not solve it.
- [ ] `timer.seconds` is a whole number `>= 1`, or the field is absent. A malformed timer is silently dropped.
- [ ] `layout.pool` is one of `bottom` `top` `left` `right`, or the field is absent. Omit it unless the derived default is wrong.
- [ ] `level` is one of `A1 A2 B1 B2 C1 C2`.
- [ ] `focus` is set, and is one of the values in `FOCUSES`. **Required.** It is what the exercise teaches, and it is in the URL.
- [ ] `topic` is either a value in `TOPICS` or **`NULL`**. Do NOT invent a context to fill it — an absent setting is a legitimate, expected answer for a pure grammar drill.
- [ ] A `listening` exercise has `media.audio`. (Enforced by database constraint.)
- [ ] Exercise content is **English only**. Site chrome is localized through `UI_LABELS`; exercise text is not mirrored `{es,en}`.
- [ ] A multi-slot exercise reads as a **sequence**: slot order is the order the learner walks, and the mechanics vary across it.

### Picking the focus

Choose the **one** language point the exercise is actually drilling — the thing a learner would search for. An exercise whose slug names two (`quantifiers-and-present-simple`) still gets one `focus`: the distinctive one. If two points are genuinely co-equal, that is two exercises.

### Focus, topic and skill display labels are English in every locale

`focus`, `topic` and `skill` are **exercise data, not site chrome**. Their display labels
live in `src/lib/exerciseTaxonomy.ts` (`FOCUS_LABELS`, `TOPIC_LABELS`, `SKILL_LABELS`) — a single
locale-independent map, deliberately **not** inside `UI_LABELS`, which is keyed
by locale.

`focus` is the strongest case of the three: it names the grammar the learner came here to acquire. Printing "Presente perfecto" over an English exercise removes the one term they need to be able to recognize in English.

Three reasons this is not a style preference:

1. **The section teaches English.** A card that announces "Escritura" over an
   English prompt translates the one word the learner came here to read.
2. **One row, one name.** A translated label makes the same database row read
   differently depending on the URL prefix it was reached through, so a learner
   and a teacher looking at the same exercise cannot use the same word for it.
3. **The slug is the label's shadow.** `code-review` is already English and is
   permanent (it is in the URL and in every published row). A per-locale label
   invents a second, softer identity for a value that has exactly one.

The CEFR `level` is the deliberate exception, split in two: the code (`A2`) is
data and is never translated; the surrounding word `Nivel` / `Level` and the
human gloss (`Básico` / `Elementary`) are chrome and stay in `UI_LABELS`.

No migration is involved in any of this. The table already stores English slugs
in `topic` and `skill` — the labels were only ever a render-time lookup.

### Marking the blank in a label

A slot label marks its gap with a **run of three or more underscores**:

```jsonc
{ "id": "s1", "label": "She ___ breakfast at eight every morning.",
  "input": "text", "answer": ["has", "eats"] }
```

The renderer splits the label at the marker and draws the control **inside the sentence**, where the gap is. The marker itself is never shown.

| Label | Result |
|---|---|
| `"She ___ breakfast."` | control between `She` and `breakfast.` |
| `"She ______ breakfast."` | same — a longer run is still **one** gap |
| `"___ is the answer."` | control first, sentence after it |
| `"The answer is ___"` | sentence first, control last |
| `"What did she say?"` | **no gap** — label above, control below (stacked) |

**Three underscores is the floor, not an exact count.** Authors stretch the gap to hint at answer length, and an exact-three rule would leave `_____` rendered as raw underscores next to the control with nothing reporting the mistake. Three is still the minimum so the marker cannot collide with ordinary content: `user_name` and `__dunder__` stay literal text.

**A label with no marker is a valid authoring style**, not an error. `"What did she say?"` above an audio clip has no gap to splice into, so it keeps the stacked layout — and a real `<label for>`, which is a better accessibility relationship than any ARIA attribute.

#### One blank per slot

**A slot has one `answer`, so it gets one gap.** Only the **first** marker is replaced by a control; any later marker stays literal text on screen:

```jsonc
// "A ___ and a ___ walk in."  ->  "A [control] and a ___ walk in."
```

That is deliberately visible rather than silently swallowed, so the author can see the second gap was not honoured.

Two gaps in one sentence need **two slots**, each with its own `answer`:

```jsonc
"slots": [
  { "id": "s1", "label": "A ___ walks in.",  "input": "text", "answer": ["dog"] },
  { "id": "s2", "label": "It orders a ___.", "input": "text", "answer": ["beer"] }
]
```

Supporting N blanks inside one label would require an answer per blank — a change to the payload contract and to grading, not a rendering tweak. It is out of scope until a real exercise needs it.

### Changing a taxonomy value

Renaming a `focus`, a `topic` or a pool item id **orphans published rows**. Treat taxonomy values as permanent once content exists. To retire one, migrate the rows explicitly — never edit the value in place.

The three are not equally expensive, and it is worth knowing which is which before touching one:

| Value | Cost of renaming it |
|---|---|
| `focus` | **Highest.** It is in the URL and in the uniqueness key: every shared deep link breaks, and the rows are unroutable until migrated. |
| `slug` | Same — in the URL and the key. |
| `topic` | Lower. It is not in the URL. A retired value renders no badge (`readTopic` collapses it to `null`) rather than breaking the page, but the context is silently lost. |
| pool item id | Breaks **grading**, silently: `answer` references the id, so the learner answers correctly and is marked wrong. The worst of the four. |

---

## Non-goals

Deliberately out of scope. Each would be a separate change.

| Not doing | Why |
|---|---|
| Per-user progress, scores, streaks | No accounts. Feedback is ephemeral and client-side. |
| Server-side answer validation | Stateless instant feedback is the requirement; there is no score to protect. |
| Open-ended writing or spoken answers | Cannot be auto-graded by any comparator here. The `text` mechanic grades a *blank*, not a paragraph. |
| A `mechanics` database table | Mechanics are code. |
