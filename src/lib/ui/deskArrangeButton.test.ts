// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDeskArrangeButton } from './deskArrangeButton';
import { DESK_ARRANGE_RESET_EVENT, dispatchArrangeVisibility } from './deskArrange';
import { DESK_DRAG_STORAGE_KEY } from '../deskDragMath';

function mountButton(): HTMLButtonElement {
  document.body.innerHTML = '<button type="button" id="desk-arrange-button" hidden>Ordenar escritorio</button>';
  return document.getElementById('desk-arrange-button') as HTMLButtonElement;
}

function stubViewport(desktop: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: desktop, media: query }));
}

describe('initDeskArrangeButton', () => {
  beforeEach(() => {
    localStorage.clear();
    stubViewport(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('stays hidden on a desktop desk with no saved widget positions', () => {
    const button = mountButton();
    initDeskArrangeButton(document);
    expect(button.hidden).toBe(true);
  });

  it('shows on load when a widget position is already saved', () => {
    localStorage.setItem(DESK_DRAG_STORAGE_KEY, JSON.stringify({ clock: { x: 120, y: 80 } }));
    const button = mountButton();
    initDeskArrangeButton(document);
    expect(button.hidden).toBe(false);
  });

  it('shows when the drag system reports a moved widget, and hides again when it reports none', () => {
    const button = mountButton();
    initDeskArrangeButton(document);

    dispatchArrangeVisibility(true, document);
    expect(button.hidden).toBe(false);

    dispatchArrangeVisibility(false, document);
    expect(button.hidden).toBe(true);
  });

  it('never shows below the desk breakpoint, even with a moved widget', () => {
    stubViewport(false);
    const button = mountButton();
    initDeskArrangeButton(document);

    dispatchArrangeVisibility(true, document);
    expect(button.hidden).toBe(true);
  });

  it('clicking it asks the desk to reset every widget and hides itself', () => {
    const button = mountButton();
    initDeskArrangeButton(document);
    dispatchArrangeVisibility(true, document);

    const resets: Event[] = [];
    document.addEventListener(DESK_ARRANGE_RESET_EVENT, (event) => resets.push(event));
    button.click();

    expect(resets).toHaveLength(1);
    expect(button.hidden).toBe(true);
  });

  it('wires a given button only once, however many times it runs', () => {
    const button = mountButton();
    initDeskArrangeButton(document);
    initDeskArrangeButton(document);

    const resets: Event[] = [];
    document.addEventListener(DESK_ARRANGE_RESET_EVENT, (event) => resets.push(event));
    button.click();

    expect(resets).toHaveLength(1);
  });

  it('is a no-op on a page without the button', () => {
    document.body.innerHTML = '';
    expect(() => initDeskArrangeButton(document)).not.toThrow();
  });
});
