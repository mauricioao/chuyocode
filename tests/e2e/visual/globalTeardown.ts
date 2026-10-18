import { resolveLocalSupabase } from './localSupabase';
import { removeVisualActivities } from './activityFixtures';

/** Removes the visual fixture activities again, leaving local Supabase as it was. */
export default async function globalTeardown(): Promise<void> {
  await removeVisualActivities(resolveLocalSupabase());
}
