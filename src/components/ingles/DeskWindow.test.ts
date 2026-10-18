import { describe, it, expect } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';
import DeskWindow from './DeskWindow.astro';

/**
 * Activity window chrome pass (owner mockup
 * `ChuyoCode_others/UX/referencias/visor-actividad-franjas-2026-10-17.jpg`,
 * 2026-10-17): the title bar shrinks its vertical padding and the title is
 * now truly centered relative to the WHOLE bar — a 3-column grid
 * (`grid-cols-[1fr_auto_1fr]`) rather than a flex row, where the title sits
 * in the leftover space between two unevenly-sized groups (lights vs.
 * actions) and drifts off-centre. Both the plain-text (practice window) and
 * editable-title (editor) branches share this one container.
 */
describe('DeskWindow.astro — title bar chrome (activity window pass, 2026-10-17)', () => {
  async function render(titleEditable = false) {
    const container = await createContainer();
    return container.renderToString(DeskWindow, {
      props: {
        lang: 'es',
        title: 'Can / Cannot - Básico A2',
        closeHref: '/es/ingles',
        closeLabel: 'Cerrar',
        minimizeLabel: 'Minimizar',
        fullScreenLabel: 'Pantalla completa',
        titleEditable,
      },
      slots: {
        default: '<p>body</p>',
      },
    });
  }

  it('shrinks the titlebar vertical padding (py-2, not the old py-3)', async () => {
    const html = await render();
    const match = html.match(/data-desk-window-titlebar[^>]*class="([^"]*)"/);
    expect(match).not.toBeNull();
    const tokens = match![1].split(/\s+/);
    expect(tokens).toContain('py-2');
    expect(tokens).not.toContain('py-3');
  });

  it('lays the titlebar out as a true 3-column grid, title centered in the middle column', async () => {
    const html = await render();
    const match = html.match(/data-desk-window-titlebar[^>]*class="([^"]*)"/);
    const tokens = match![1].split(/\s+/);
    expect(tokens).toContain('grid');
    expect(tokens).toContain('grid-cols-[1fr_auto_1fr]');
    // No longer a flex row — the old leftover-space centering trick is gone.
    expect(tokens).not.toContain('flex');
    expect(tokens).not.toContain('justify-center');
  });

  it('keeps the traffic-light hit boxes at >=28px (unchanged by the shorter bar)', async () => {
    const html = await render();
    expect(html).toContain('h-7 w-7');
  });

  it('pins the actions group to the grid column end instead of an `ml-auto` flex push', async () => {
    const html = await render();
    const match = html.match(/id="desk-window-actions"[^>]*class="([^"]*)"|class="([^"]*)"[^>]*id="desk-window-actions"/);
    expect(match).not.toBeNull();
    const classAttr = match![1] ?? match![2];
    const tokens = classAttr.split(/\s+/);
    expect(tokens).toContain('justify-self-end');
    expect(tokens).not.toContain('ml-auto');
  });

  it('centers the plain-text title group with no flex-1 leftover-space trick', async () => {
    const html = await render(false);
    expect(html).toContain('id="desk-window-title"');
    // The title group wrapper should carry min-w-0 for truncation but no
    // longer flex-1, now that centering is the grid's job (only the
    // non-editable branch's own internal row — identified by its unique
    // `justify-center` — is relevant here).
    const wrapperMatch = html.match(/<div class="([^"]*justify-center[^"]*)"/);
    expect(wrapperMatch).not.toBeNull();
    const tokens = wrapperMatch![1].split(/\s+/);
    expect(tokens).toContain('min-w-0');
    expect(tokens).not.toContain('flex-1');
  });

  it('still renders the editable-title slot for the editor branch', async () => {
    const html = await render(true);
    expect(html).toContain('id="desk-window-title-group"');
  });
});

// Vertical centring (owner request, 2026-10-18): the window used to open
// ~30px low — a fixed `desk:bottom-16` (64px) bottom inset against a
// measured `--chrome-header-offset` top inset is not symmetric. Fix: the
// SAME offset on both edges, so the window is vertically centred between
// the header and the viewport's own bottom edge (shorter, never taller).
describe('DeskWindow.astro — window geometry (vertical centring, 2026-10-18)', () => {
  async function render() {
    const container = await createContainer();
    return container.renderToString(DeskWindow, {
      props: {
        lang: 'es',
        title: 'Can / Cannot - Básico A2',
        closeHref: '/es/ingles',
        closeLabel: 'Cerrar',
        minimizeLabel: 'Minimizar',
        fullScreenLabel: 'Pantalla completa',
      },
      slots: { default: '<p>body</p>' },
    });
  }

  it('insets the non-embedded window by the SAME offset on top and bottom, not a fixed bottom-16', async () => {
    const html = await render();
    const match = html.match(/data-desk-window[^>]*class="([^"]*)"/);
    expect(match).not.toBeNull();
    const tokens = match![1].split(/\s+/);
    expect(tokens).toContain('desk:top-(--chrome-header-offset)');
    expect(tokens).toContain('desk:bottom-(--chrome-header-offset)');
    expect(tokens).not.toContain('desk:bottom-16');
  });
});
