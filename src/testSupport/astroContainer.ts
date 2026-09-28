/**
 * Shared `AstroContainer` factory for tests that render `Header.astro` —
 * directly, or via `BaseLayout` (every page).
 *
 * `experimental_AstroContainer.create()` starts with NO renderers registered.
 * Since Login step 1b (this slice), `Header.astro` unconditionally mounts the
 * `UserMenu` React island (`client:load`), so any test rendering it now needs
 * a React server renderer or the render throws `NoMatchingRenderer` — see the
 * container API's own `astro:container` virtual module, which documents
 * exactly this fix. Every affected test file states it once through this
 * helper instead of repeating the three-import dance.
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/react';
import { loadRenderers } from 'astro:container';

export async function createContainer(): Promise<
  Awaited<ReturnType<typeof AstroContainer.create>>
> {
  const renderers = await loadRenderers([getContainerRenderer()]);
  return AstroContainer.create({ renderers });
}
