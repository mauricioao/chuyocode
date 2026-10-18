import { resolveLocalSupabase } from './localSupabase';
import { seedVisualActivities } from './activityFixtures';

/**
 * Visual suite global setup (playwright.visual.config.ts): writes the fixed
 * published-activity set to the LOCAL Supabase stack, arranged for today's
 * "Actividad del día" (see ./activityFixtures.ts). Refuses any non-loopback
 * Supabase URL before touching the network.
 */
export default async function globalSetup(): Promise<void> {
  await seedVisualActivities(resolveLocalSupabase(), new Date());
}
