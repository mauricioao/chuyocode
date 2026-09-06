-- Seed data: English exercises for A1 and A2 levels.
--
-- This file contains the first real content batch: 40 exercises (A1 and A2 only,
-- 4 focuses per level, 5 exercises per focus). It proves the content pipeline and
-- serves as a baseline for quality and pedagogy review before committing to the
-- full ~300-exercise catalogue.
--
-- The payload contract is in docs/exercise-model.md. Answer keys grade correctly
-- per src/lib/exerciseGrading.ts, and all taxonomy values pass the guards in
-- src/lib/exerciseTaxonomy.ts.
--
-- Idempotent: safe to run twice. Uses `on conflict (level, focus, slug) do nothing`.

insert into public.exercises
  (slug, skill, level, focus, topic, payload, published)
values

-- =============================================================================
-- A1: PRESENT SIMPLE
-- =============================================================================

('everyday-routine', 'writing', 'A1', 'present-simple', 'daily-life',
  '{"pools":{"verbs":[{"id":"v_work","text":"work"},{"id":"v_live","text":"live"},{"id":"v_sleep","text":"sleep"}]},"slots":[{"id":"s1","label":"I ___ in Madrid.","input":"text","answer":["live"]}]}',
  true),

('yes-no-questions', 'reading', 'A1', 'present-simple', NULL,
  '{"pools":{"opts":[{"id":"a","text":"Yes, she does"},{"id":"b","text":"No, he does"},{"id":"c","text":"Sometimes"}]},"slots":[{"id":"s1","label":"Does your friend like coffee?","input":"choice","pool":"opts","answer":["a"]}]}',
  true),

('third-person-singular', 'writing', 'A1', 'present-simple', 'family-and-friends',
  '{"pools":{},"slots":[{"id":"s1","label":"He ___ two sisters.","input":"text","answer":["has"]}]}',
  true),

('present-simple-negative', 'writing', 'A1', 'present-simple', NULL,
  '{"pools":{"opts":[{"id":"w_dont","text":"don''t"},{"id":"w_doesnt","text":"doesn''t"},{"id":"w_not","text":"not"}]},"slots":[{"id":"s1","label":"I ___ like spicy food.","input":"choice","pool":"opts","answer":["w_dont"]}]}',
  true),

('everyday-actions', 'reading', 'A1', 'present-simple', 'daily-life',
  '{"pools":{"activities":[{"id":"a_read","text":"read"},{"id":"a_walk","text":"walk"},{"id":"a_swim","text":"swim"},{"id":"a_run","text":"run"}]},"slots":[{"id":"s1","label":"What do you do every morning? I ___.","input":"select","pool":"activities","answer":["a_read"]}]}',
  true),

('wakes-up-routine', 'reading', 'A1', 'present-simple', 'daily-life',
  '{"pools":{"times":[{"id":"t_6am","text":"6 AM"},{"id":"t_7am","text":"7 AM"},{"id":"t_8am","text":"8 AM"},{"id":"t_9am","text":"9 AM"}]},"slots":[{"id":"s1","label":"What time does John wake up? He wakes up at ___.","input":"select","pool":"times","answer":["t_7am"]}]}',
  true),

-- =============================================================================
-- A1: VERB TO BE
-- =============================================================================

('profession-introduction', 'writing', 'A1', 'verb-to-be', 'job-interview',
  '{"pools":{},"slots":[{"id":"s1","label":"I ___ a software engineer.","input":"text","answer":["am"]}]}',
  true),

('nationality-topic', 'writing', 'A1', 'verb-to-be', NULL,
  '{"pools":{},"slots":[{"id":"s1","label":"They ___ from Brazil.","input":"text","answer":["are"]}]}',
  true),

('plural-verb-to-be', 'reading', 'A1', 'verb-to-be', 'family-and-friends',
  '{"pools":{"forms":[{"id":"f_am","text":"am"},{"id":"f_are","text":"are"},{"id":"f_is","text":"is"}]},"slots":[{"id":"s1","label":"My sisters ___ students.","input":"choice","pool":"forms","answer":["f_are"]}]}',
  true),

('negative-be', 'writing', 'A1', 'verb-to-be', NULL,
  '{"pools":{},"slots":[{"id":"s1","label":"She is not ___ a doctor.","input":"text","answer":["a"]}]}',
  true),

('be-questions', 'reading', 'A1', 'verb-to-be', NULL,
  '{"pools":{"responses":[{"id":"r_yes","text":"Yes, I am"},{"id":"r_no","text":"No, I am not"},{"id":"r_maybe","text":"Maybe"}]},"slots":[{"id":"s1","label":"Are you happy?","input":"choice","pool":"responses","answer":["r_yes"]}]}',
  true),

-- =============================================================================
-- A1: ARTICLES
-- =============================================================================

('article-a-an', 'writing', 'A1', 'articles', NULL,
  '{"pools":{},"slots":[{"id":"s1","label":"This is ___ apple.","input":"text","answer":["an"]}]}',
  true),

('indefinite-article-choice', 'reading', 'A1', 'articles', 'food',
  '{"pools":{"articles":[{"id":"art_a","text":"a"},{"id":"art_an","text":"an"},{"id":"art_the","text":"the"}]},"slots":[{"id":"s1","label":"I want ___ orange juice.","input":"choice","pool":"articles","answer":["art_an"]}]}',
  true),

('definite-article', 'writing', 'A1', 'articles', NULL,
  '{"pools":{},"slots":[{"id":"s1","label":"___ cat is on the table.","input":"text","answer":["the"]}]}',
  true),

('article-with-occupations', 'reading', 'A1', 'articles', 'job-interview',
  '{"pools":{"opts":[{"id":"opt_a","text":"a"},{"id":"opt_an","text":"an"},{"id":"opt_none","text":"(no article)"}]},"slots":[{"id":"s1","label":"My father is ___ engineer.","input":"choice","pool":"opts","answer":["opt_an"]}]}',
  true),

('article-zero-article', 'writing', 'A1', 'articles', NULL,
  '{"pools":{},"slots":[{"id":"s1","label":"I like ___ coffee.","input":"text","answer":["coffee","the coffee"]}]}',
  true),

-- =============================================================================
-- A1: PREPOSITIONS
-- =============================================================================

('location-prepositions', 'writing', 'A1', 'prepositions', 'travel',
  '{"pools":{},"slots":[{"id":"s1","label":"The museum is ___ the city center.","input":"text","answer":["in"]}]}',
  true),

('preposition-on-in-at', 'reading', 'A1', 'prepositions', NULL,
  '{"pools":{"preps":[{"id":"p_on","text":"on"},{"id":"p_in","text":"in"},{"id":"p_at","text":"at"}]},"slots":[{"id":"s1","label":"My keys are ___ the table.","input":"choice","pool":"preps","answer":["p_on"]}]}',
  true),

('time-prepositions', 'writing', 'A1', 'prepositions', NULL,
  '{"pools":{},"slots":[{"id":"s1","label":"We have a meeting ___ Monday morning.","input":"text","answer":["on"]}]}',
  true),

('direction-prepositions', 'reading', 'A1', 'prepositions', 'travel',
  '{"pools":{"directions":[{"id":"d_to","text":"to"},{"id":"d_from","text":"from"},{"id":"d_into","text":"into"},{"id":"d_out","text":"out of"}]},"slots":[{"id":"s1","label":"I come ___ Colombia originally.","input":"select","pool":"directions","answer":["d_from"]}]}',
  true),

('preposition-mixed', 'writing', 'A1', 'prepositions', 'daily-life',
  '{"pools":{},"slots":[{"id":"s1","label":"I work ___ home.","input":"text","answer":["at","from"]}]}',
  true),

-- =============================================================================
-- A2: PAST SIMPLE
-- =============================================================================

('regular-past-simple', 'writing', 'A2', 'past-simple', 'daily-life',
  '{"pools":{},"slots":[{"id":"s1","label":"Yesterday I ___ my homework.","input":"text","answer":["finished","did"]}]}',
  true),

('past-simple-negative', 'reading', 'A2', 'past-simple', NULL,
  '{"pools":{"opts":[{"id":"o_went","text":"went"},{"id":"o_did_not_go","text":"did not go"},{"id":"o_not_go","text":"not go"}]},"slots":[{"id":"s1","label":"She ___ to the meeting last week.","input":"choice","pool":"opts","answer":["o_did_not_go"]}]}',
  true),

('past-simple-question', 'reading', 'A2', 'past-simple', 'daily-standup',
  '{"pools":{"answers":[{"id":"ans_yes","text":"Yes, I did"},{"id":"ans_no","text":"No, I did not"},{"id":"ans_some","text":"Some of them"}]},"slots":[{"id":"s1","label":"Did you complete the review?","input":"choice","pool":"answers","answer":["ans_yes"]}]}',
  true),

('irregular-past-simple', 'writing', 'A2', 'past-simple', NULL,
  '{"pools":{},"slots":[{"id":"s1","label":"I ___ a great movie last night.","input":"text","answer":["saw"]}]}',
  true),

('past-simple-story', 'reading', 'A2', 'past-simple', 'family-and-friends',
  '{"pools":{"events":[{"id":"ev_met","text":"met"},{"id":"ev_meet","text":"meet"},{"id":"ev_meets","text":"meets"},{"id":"ev_meeting","text":"meeting"}]},"slots":[{"id":"s1","label":"We ___ last summer at the beach.","input":"select","pool":"events","answer":["ev_met"]}]}',
  true),

-- =============================================================================
-- A2: PRESENT CONTINUOUS
-- =============================================================================

('present-continuous-now', 'writing', 'A2', 'present-continuous', 'daily-life',
  '{"pools":{},"slots":[{"id":"s1","label":"He is ___ his email.","input":"text","answer":["reading","checking"]}]}',
  true),

('present-continuous-question', 'reading', 'A2', 'present-continuous', NULL,
  '{"pools":{"activities":[{"id":"a_sleeping","text":"sleeping"},{"id":"a_working","text":"working"},{"id":"a_eating","text":"eating"},{"id":"a_running","text":"running"}]},"slots":[{"id":"s1","label":"What is she doing? She is ___.","input":"select","pool":"activities","answer":["a_working"]}]}',
  true),

('present-continuous-negative', 'reading', 'A2', 'present-continuous', NULL,
  '{"pools":{"opts":[{"id":"opt_watch","text":"is watching"},{"id":"opt_not_watching","text":"is not watching"},{"id":"opt_watches","text":"watches"}]},"slots":[{"id":"s1","label":"They ___ TV right now, they are studying.","input":"choice","pool":"opts","answer":["opt_not_watching"]}]}',
  true),

('present-continuous-standups', 'writing', 'A2', 'present-continuous', 'daily-standup',
  '{"pools":{},"slots":[{"id":"s1","label":"I am currently ___ on the authentication system.","input":"text","answer":["working"]}]}',
  true),

('present-continuous-temporary', 'reading', 'A2', 'present-continuous', 'daily-life',
  '{"pools":{"verbs":[{"id":"v_studying","text":"studying"},{"id":"v_study","text":"study"},{"id":"v_studied","text":"studied"},{"id":"v_studies","text":"studies"}]},"slots":[{"id":"s1","label":"Right now I am ___ for my exam.","input":"select","pool":"verbs","answer":["v_studying"]}]}',
  true),

-- =============================================================================
-- A2: MODAL VERBS (basic: can, must)
-- =============================================================================

('can-ability', 'writing', 'A2', 'modal-verbs', NULL,
  '{"pools":{},"slots":[{"id":"s1","label":"I ___ speak Spanish well.","input":"text","answer":["can"]}]}',
  true),

('can-permission', 'reading', 'A2', 'modal-verbs', 'job-interview',
  '{"pools":{"modal_opts":[{"id":"mo_can","text":"Can"},{"id":"mo_must","text":"Must"},{"id":"mo_should","text":"Should"}]},"slots":[{"id":"s1","label":"___ I ask a question?","input":"choice","pool":"modal_opts","answer":["mo_can"]}]}',
  true),

('must-obligation', 'writing', 'A2', 'modal-verbs', 'technical-documentation',
  '{"pools":{},"slots":[{"id":"s1","label":"You ___ read the documentation before starting.","input":"text","answer":["must"]}]}',
  true),

('cannot-negative', 'reading', 'A2', 'modal-verbs', NULL,
  '{"pools":{"responses":[{"id":"r_cant","text":"cannot"},{"id":"r_can","text":"can"},{"id":"r_not_can","text":"not can"}]},"slots":[{"id":"s1","label":"They ___ attend the meeting because they are busy.","input":"choice","pool":"responses","answer":["r_cant"]}]}',
  true),

('modal-verbs-mixed', 'writing', 'A2', 'modal-verbs', 'daily-life',
  '{"pools":{},"slots":[{"id":"s1","label":"You ___ park here. It is not allowed.","input":"text","answer":["cannot","can''t"]}]}',
  true),

('must-restaurant', 'reading', 'A2', 'modal-verbs', 'food',
  '{"pools":{"activities":[{"id":"act_must_reserve","text":"must reserve"},{"id":"act_can_reserve","text":"can reserve"},{"id":"act_should_go","text":"should go"},{"id":"act_will_arrive","text":"will arrive"}]},"slots":[{"id":"s1","label":"You ___ a table at this restaurant in advance.","input":"select","pool":"activities","answer":["act_must_reserve"]}]}',
  true),

-- =============================================================================
-- A2: QUANTIFIERS
-- =============================================================================

('some-any-basic', 'writing', 'A2', 'quantifiers', 'food',
  '{"pools":{},"slots":[{"id":"s1","label":"Do you have ___ milk?","input":"text","answer":["any"]}]}',
  true),

('some-affirmative', 'reading', 'A2', 'quantifiers', NULL,
  '{"pools":{"quantities":[{"id":"q_some","text":"some"},{"id":"q_any","text":"any"},{"id":"q_a_lot","text":"a lot"}]},"slots":[{"id":"s1","label":"I have ___ friends in this city.","input":"choice","pool":"quantities","answer":["q_some"]}]}',
  true),

('much-many', 'writing', 'A2', 'quantifiers', 'food',
  '{"pools":{},"slots":[{"id":"s1","label":"How ___ books do you have?","input":"text","answer":["many"]}]}',
  true),

('few-a-few', 'reading', 'A2', 'quantifiers', NULL,
  '{"pools":{"few_opts":[{"id":"fo_a_few","text":"a few"},{"id":"fo_few","text":"few"},{"id":"fo_some","text":"some"},{"id":"fo_many","text":"many"}]},"slots":[{"id":"s1","label":"There are only ___ students in the class today.","input":"select","pool":"few_opts","answer":["fo_a_few"]}]}',
  true),

('quantifiers-code-review', 'writing', 'A2', 'quantifiers', 'code-review',
  '{"pools":{},"slots":[{"id":"s1","label":"There are ___ issues to fix before merging.","input":"text","answer":["some","a few"]}]}',
  true)

on conflict (level, focus, slug) do nothing;

-- Verification: summary counts per (level, focus).
select level, focus, count(*) as exercise_count
  from public.exercises
  where level in ('A1', 'A2')
  group by level, focus
  order by level, focus;
