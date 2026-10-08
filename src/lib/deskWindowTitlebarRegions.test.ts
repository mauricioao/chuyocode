// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { subtractRects, measureTitlebarDragRegions, type Rect } from './deskWindowTitlebarRegions';

describe('subtractRects', () => {
  const outer: Rect = { x: 0, y: 0, width: 300, height: 40 };

  it('returns the outer rect unchanged when there is nothing to exclude', () => {
    expect(subtractRects(outer, [])).toEqual([outer]);
  });

  it('splits into a left and right handle around one centered exclude, full height', () => {
    const exclude: Rect = { x: 100, y: 0, width: 50, height: 40 };
    const result = subtractRects(outer, [exclude]);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(result).toContainEqual({ x: 150, y: 0, width: 150, height: 40 });
  });

  it('subtracts several same-row excludes (traffic lights + actions), keeping the gaps between them', () => {
    const lights: Rect = { x: 0, y: 0, width: 60, height: 40 };
    const actions: Rect = { x: 250, y: 0, width: 50, height: 40 };
    const result = subtractRects(outer, [lights, actions]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ x: 60, y: 0, width: 190, height: 40 });
  });

  it('merges a tall exclude-free column spanning multiple Y bands back into ONE rect', () => {
    // Two excludes stacked at the right edge, at different Y bands, leave a
    // single uninterrupted free column on the left at full height.
    const topRight: Rect = { x: 200, y: 0, width: 100, height: 20 };
    const bottomRight: Rect = { x: 200, y: 20, width: 100, height: 20 };
    const result = subtractRects(outer, [topRight, bottomRight]);
    expect(result).toEqual([{ x: 0, y: 0, width: 200, height: 40 }]);
  });

  it('clips an exclude that only partially overlaps the outer rect', () => {
    const exclude: Rect = { x: -20, y: -10, width: 40, height: 60 }; // sticks out past the top-left corner
    const result = subtractRects(outer, [exclude]);
    expect(result).toEqual([{ x: 20, y: 0, width: 280, height: 40 }]);
  });

  it('ignores an exclude entirely outside the outer rect', () => {
    const exclude: Rect = { x: 1000, y: 1000, width: 10, height: 10 };
    expect(subtractRects(outer, [exclude])).toEqual([outer]);
  });

  it('returns [] when excludes fully cover the outer rect', () => {
    const exclude: Rect = { x: -10, y: -10, width: 1000, height: 1000 };
    expect(subtractRects(outer, [exclude])).toEqual([]);
  });

  it('handles excludes wrapped onto two different rows (the editable-title titlebar, which can flex-wrap)', () => {
    const wide: Rect = { x: 0, y: 0, width: 300, height: 80 };
    const row1Control: Rect = { x: 0, y: 0, width: 60, height: 40 }; // lights, top row
    const row2Control: Rect = { x: 0, y: 40, width: 220, height: 40 }; // title input, wrapped to row 2
    const result = subtractRects(wide, [row1Control, row2Control]);
    expect(result).toContainEqual({ x: 60, y: 0, width: 240, height: 40 });
    expect(result).toContainEqual({ x: 220, y: 40, width: 80, height: 40 });
  });
});

describe('measureTitlebarDragRegions', () => {
  function stubRect(el: Element, rect: { x: number; y: number; width: number; height: number }): void {
    el.getBoundingClientRect = () =>
      ({ ...rect, top: rect.y, left: rect.x, right: rect.x + rect.width, bottom: rect.y + rect.height, toJSON() {} }) as DOMRect;
  }

  it('returns [] when there is no title bar at all (not loaded / a broken fallback page)', () => {
    const doc = document.implementation.createHTMLDocument('');
    expect(measureTitlebarDragRegions(doc)).toEqual([]);
    expect(measureTitlebarDragRegions(null)).toEqual([]);
    expect(measureTitlebarDragRegions(undefined)).toEqual([]);
  });

  it('subtracts every interactive control inside the title bar from its own rect', () => {
    const doc = document.implementation.createHTMLDocument('');
    const titlebar = doc.createElement('div');
    titlebar.setAttribute('data-desk-window-titlebar', '');
    stubRect(titlebar, { x: 0, y: 0, width: 300, height: 40 });

    const closeLight = doc.createElement('a');
    stubRect(closeLight, { x: 0, y: 0, width: 60, height: 40 });
    const fullscreenButton = doc.createElement('button');
    stubRect(fullscreenButton, { x: 250, y: 0, width: 50, height: 40 });
    const titleText = doc.createElement('b'); // not interactive — never excluded
    stubRect(titleText, { x: 60, y: 0, width: 190, height: 40 });

    titlebar.append(closeLight, titleText, fullscreenButton);
    doc.body.appendChild(titlebar);

    expect(measureTitlebarDragRegions(doc)).toEqual([{ x: 60, y: 0, width: 190, height: 40 }]);
  });
});
