/**
 * Server-only account-deletion write path (owner decision, 2026-10-04: "a
 * user can delete their account"). Backs `POST /api/cuenta/eliminar`'s
 * whole DATA-layer orchestration:
 *
 * ```
 * 1. transfer_and_purge_user RPC fails            -> purge_failed
 *    (`supabase/migrations/0020_account_deletion.sql`; nothing below runs —
 *    the RPC's own transaction already rolled back, the account is exactly
 *    as it was)
 * 2. the user's private uploads folder (images OR  -> storage_cleanup_failed
 *    audio markers) cannot be fully cleared            (🔴 see below — the DB
 *    (`removeAllUserUploads`/`removeAllUserAudioUploads`) purge above already
 *                                                       committed)
 * 3. auth.admin.deleteUser fails                   -> delete_user_failed
 *                                                       (🔴 same note)
 * 4. success                                       -> ok: true
 * ```
 *
 * The endpoint (`src/pages/api/cuenta/eliminar.ts`) owns everything about
 * the REQUEST — the confirmation-word check, the 401 guard, and signing the
 * session out on success via `createSessionClient`/`flushSessionHeaders` —
 * deliberately NOT this module's job, same split `signout.ts` keeps between
 * route-level cookie work and any lib module underneath it.
 *
 * 🔴 STEPS 1-3 ARE NOT ONE ATOMIC TRANSACTION, AND CANNOT BE. Step 1 is one
 * Postgres transaction (the RPC, `security definer`, runs to completion or
 * rolls back as a whole). Steps 2 and 3 are separate calls — to Supabase
 * Storage and to the GoTrue Auth Admin API — neither of which shares a
 * transaction with Postgres or with each other. A failure in step 2 or 3
 * therefore leaves this user's APP DATA already transferred/purged while
 * their `auth.users` row (and their ability to sign in) still exists. The
 * endpoint's own contract — "on any failure before `deleteUser`, the
 * account must remain usable" — is about never deleting the AUTH USER on an
 * early failure, not about undoing step 1; no step here attempts to. It is
 * safe to simply RETRY the whole request after such a failure: every one of
 * the RPC's own statements is already a plain `WHERE author_id = p_user`
 * (or equivalent) that matches nothing the second time — see that
 * migration's own header — so calling this again picks up exactly where it
 * left off instead of redoing (or re-failing) anything.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from './supabase';
import { removeAllUserUploads, removeAllUserAudioUploads } from './activities/storage';

/** The SQL function name — must match `0020_account_deletion.sql`. */
const TRANSFER_AND_PURGE_RPC = 'transfer_and_purge_user';

let serviceClient: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (serviceClient) return serviceClient;
  try {
    serviceClient = createServiceClient();
    return serviceClient;
  } catch {
    return null;
  }
}

/** Reset the lazily-created service client. Test isolation only. */
export function clearAccountDeletionClient(): void {
  serviceClient = null;
}

export type DeleteAccountError = 'purge_failed' | 'storage_cleanup_failed' | 'delete_user_failed';
export type DeleteAccountResult = { ok: true } | { ok: false; error: DeleteAccountError };

/**
 * `POST /api/cuenta/eliminar`'s data-layer write path — see file header for
 * the full step list and the ordering note on why steps 1-3 cannot be one
 * atomic unit.
 */
export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const client = getClient();
  if (!client) return { ok: false, error: 'purge_failed' };

  try {
    const { error } = await client.rpc(TRANSFER_AND_PURGE_RPC, { p_user: userId });
    if (error) {
      console.error('[accountDeletion] transfer_and_purge_user RPC failed:', error.message);
      return { ok: false, error: 'purge_failed' };
    }
  } catch (err) {
    console.error('[accountDeletion] transfer_and_purge_user RPC threw:', err);
    return { ok: false, error: 'purge_failed' };
  }

  // DB purge already committed at this point — see the 🔴 note above.
  const storageCleared = await removeAllUserUploads(userId);
  if (!storageCleared) {
    return { ok: false, error: 'storage_cleanup_failed' };
  }

  // Same cleanup for the user's private audio-uploads folder (worksheet
  // audio markers) — same reasoning as the image uploads above: once
  // approved, a marker's revision is rewritten to point at the PUBLIC
  // `activity-audio/<activityId>/…` copy (`copyToAudioBucket`, called from
  // `approveRevision`), so nothing a transferred/live activity still plays
  // ever lives in this bucket.
  const audioStorageCleared = await removeAllUserAudioUploads(userId);
  if (!audioStorageCleared) {
    return { ok: false, error: 'storage_cleanup_failed' };
  }

  try {
    const { error } = await client.auth.admin.deleteUser(userId);
    if (error) {
      console.error('[accountDeletion] auth.admin.deleteUser failed:', error.message);
      return { ok: false, error: 'delete_user_failed' };
    }
  } catch (err) {
    console.error('[accountDeletion] auth.admin.deleteUser threw:', err);
    return { ok: false, error: 'delete_user_failed' };
  }

  return { ok: true };
}
