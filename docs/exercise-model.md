# Exercise Model

The data contract behind the English section. Every exercise — multiple choice, fill-in-the-blank, dropdown, drag-and-drop, matching, listening — is stored in **one table** with **one payload shape** and graded by **one function**.

This document is the source of truth. If code and this document disagree, that is a bug in one of them.

## Quick path

Adding a new exercise **mechanic** (a new way to answer):

1. Write a renderer component.
2. Pick a comparator (`set`, `text`, or `sequence` — you almost never need a new one).
3. Add one line to the mechanic registry.

No migration. No table change. No change to the grading function. No change to existing exercises.

---

## The two axes

The single most important idea here. Confusing these two produces a combinatorial explosion of exercise types.

| Axis | Field | What it describes | Values |
|---|---|---|---|
| **Stimulus** | `payload.media` | What the learner perceives | text, audio, image, video |
| **Mechanic** | `slot.input` | How the learner answers | `choice`, `text`, `drop`, `select`, `order`, … |

**Listening is not an exercise type.** It is an audio stimulus layered on any mechanic. A listening exercise can be multiple choice, fill-in-the-blank, or ordering. Modeling "listening" as a type would force duplicating every answer mechanic inside it.

The same applies to reading and to image-based prompts. `skill` (writing / listening / reading) is a **filter label for the UI**, never a dispatch key.

---

## Payload shape

Three concepts. That is the whole model.

```jsonc
{
  "media": { "audio": "https://…" },          // optional stimulus
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

| Key | Purpose |
|---|---|
| `media` | The stimulus. Optional. Presence of `media.audio` is what makes an exercise "listening". |
| `pools` | Named sets of selectable items. A pool is **shared across slots** — declare the 18 food images once, not once per row. |
| `slots` | The things to answer. Each carries its own `answer`. |

### Why the answer lives inside the slot

An earlier draft used a separate `key: { slotId: [...] }` map. That allows a key entry whose id matches no slot — a silent bug where an exercise looks gradeable but isn't. Nesting the answer removes that class of error entirely.

### Why `pools` is always used

Even for a plain multiple-choice question with one pool, where inline `choices` would be shorter.

**One code path.** Allowing "sometimes a pool reference, sometimes inline options" forces a branch in every renderer and every validator, forever, for every mechanic added from now on. Three extra characters of JSON is a better trade than a permanent conditional.

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

## Grading

One function. Every mechanic.

```ts
function check(payload: Payload, response: Response): boolean {
  return payload.slots.every((slot) => {
    const expected = slot.answer ?? [];
    const given = response[slot.id] ?? [];
    return slot.ordered
      ? sameSequence(expected, given)
      : sameSet(normalize(expected), normalize(given));
  });
}
```

Every slot is graded independently, which is what allows a single exercise to mix mechanics.

### Comparators

Eight mechanics collapse to three comparators. The comparator is **not** the axis that grows — the renderer is. That is why the extension point is the renderer.

| Mechanic | Response shape | Comparator |
|---|---|---|
| Multiple choice | `["b"]` | `set` |
| Multi-select | `["a","c"]` | `set` |
| Drag and drop | `["i_olives"]` | `set` |
| Matching | `["a"]` per slot | `set` |
| Dropdown | `["some"]` | `set` |
| Fill in the blank | `["sits"]` | `text` (normalized) |
| Ordering | `["c","a","b"]` | `sequence` |
| Hotspot | `[{x,y}]` | `proximity` |

Text normalization trims the edges and lowercases; inner spacing is preserved so multi-word answers stay distinguishable. Multiple accepted answers go in the same array: `"answer": ["sits", "is sitting"]`.

---

## Adding a mechanic

A mechanic is one file:

```ts
export const hotspot: Mechanic = {
  input: 'hotspot',            // the discriminator matched against slot.input
  compare: 'proximity',        // reuse an existing comparator when possible
  schema: hotspotSlotSchema,   // zod — validates slot shape at parse time
  Renderer: HotspotRenderer,   // the only genuinely new code
}
```

Plus one line in the registry:

```ts
const mechanics = { choice, text, drop, select, order, hotspot }
```

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
  topic       text not null,
  payload     jsonb not null default '{}',
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),  -- maintained by trigger
  updated_by  uuid references auth.users(id),

  unique (level, topic, slug)
);

create index on exercises (level, topic) where published;

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

### Deep links

Exercises are addressed as `/[lang]/ingles/[level]/[topic]/[slug]`. Teachers share individual exercises, so the URL must be stable and readable.

`slug` is unique **per `(level, topic)`**, not globally — the same slug may exist at different levels, which keeps slugs short and human-readable (`ordering-coffee` can exist at A1 and B2 without collision).

Changing a published `slug` breaks every shared link to it. Treat it as permanent once published, exactly like a `topic` value.

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

Two mechanics per row: drag the image into the box, **and** pick the quantifier. Two pools, two slots per row, one shared image pool across every row.

```jsonc
{
  "pools": {
    "food_images": [
      { "id": "i_olives", "media": "https://…/olives.jpg" },
      { "id": "i_honey",  "media": "https://…/honey.jpg"  }
    ],
    "quantifiers": [
      { "id": "a",    "text": "a"    },
      { "id": "an",   "text": "an"   },
      { "id": "some", "text": "some" }
    ]
  },
  "slots": [
    { "id": "olives_img", "label": "olives", "input": "drop",
      "pool": "food_images", "answer": ["i_olives"] },
    { "id": "olives_qty", "label": "olives", "input": "select",
      "pool": "quantifiers", "answer": ["some"] },

    { "id": "honey_img", "label": "honey", "input": "drop",
      "pool": "food_images", "answer": ["i_honey"] },
    { "id": "honey_qty", "label": "honey", "input": "select",
      "pool": "quantifiers", "answer": ["some"] }
  ]
}
```

### Ordering

`ordered: true` switches that slot to the `sequence` comparator.

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

- [ ] Every slot has a non-empty `answer`.
- [ ] Every id in an `answer` exists in the slot's referenced pool (except `input: "text"`, where answers are literal strings).
- [ ] Pool item ids are unique within their pool and are **never** reused for a different item after publishing — a published id is permanent.
- [ ] A choice-style slot references a pool with at least two items.
- [ ] `level` is one of `A1 A2 B1 B2 C1 C2`.
- [ ] A `listening` exercise has `media.audio`. (Enforced by database constraint.)
- [ ] Exercise content is **English only**. Site chrome is localized through `UI_LABELS`; exercise text is not mirrored `{es,en}`.

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

Renaming a `topic` or a pool item id **orphans published rows**. Treat taxonomy values as permanent once content exists. To retire one, migrate the rows explicitly — never edit the value in place.

---

## Non-goals

Deliberately out of scope. Each would be a separate change.

| Not doing | Why |
|---|---|
| Per-user progress, scores, streaks | No accounts. Feedback is ephemeral and client-side. |
| Server-side answer validation | Stateless instant feedback is the requirement; there is no score to protect. |
| Free-text or spoken answers | Cannot be auto-graded by any comparator here. |
| A `mechanics` database table | Mechanics are code. |
