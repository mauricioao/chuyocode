-- TEST exercise — new authoring format (docs/exercise-authoring-brief.md).
-- One mixed exercise, 5 slots, all 4 mechanics (drop, select, choice, text).
-- Purpose: verify the new contract before generating the full batches again
-- (all previous seed files and DB rows were wiped when the exercise view/
-- payload format changed).

insert into public.exercises
  (slug, skill, level, focus, topic, payload, published)
values

-- ---------- A1 · present-simple · daily-standup ----------
('daily-standup-routine', 'writing', 'A1', 'present-simple', 'daily-standup', '{
  "pools": {
    "verbs": [
      { "id": "v_has",       "text": "has" },
      { "id": "v_explains",  "text": "explains" },
      { "id": "v_have",      "text": "have" },
      { "id": "v_discusses", "text": "discusses" }
    ],
    "frequency": [
      { "id": "f_daily",   "text": "daily" },
      { "id": "f_weekly",  "text": "weekly" },
      { "id": "f_monthly", "text": "monthly" }
    ],
    "aux": [
      { "id": "au_does", "text": "Does" },
      { "id": "au_do",   "text": "Do" },
      { "id": "au_did",  "text": "Did" }
    ]
  },
  "slots": [
    { "id": "s1", "label": "Every morning, our team ___ a short meeting.",
      "input": "drop", "pool": "verbs", "answer": ["v_has"] },

    { "id": "s2", "label": "Each developer ___ what they did yesterday.",
      "input": "drop", "pool": "verbs", "answer": ["v_explains"] },

    { "id": "s3", "label": "The standup happens ___, Monday to Friday.",
      "input": "select", "pool": "frequency", "answer": ["f_daily"] },

    { "id": "s4", "label": "___ your team write down the action items afterward?",
      "input": "choice", "pool": "aux", "answer": ["au_does"] },

    { "id": "s5", "label": "After the standup, developers usually ___ working on their tasks.",
      "input": "text", "answer": ["continue", "keep", "resume"] }
  ]
}', true)

on conflict (level, focus, slug) do nothing;

-- Verification
select level, focus, count(*) from public.exercises
group by level, focus order by level, focus;
