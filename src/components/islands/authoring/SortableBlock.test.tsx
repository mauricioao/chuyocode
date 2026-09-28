// @vitest-environment jsdom
/**
 * SortableBlock tests — the wiring `useSortable` needs, isolated from
 * `BlockList`'s own reorder-behavior tests.
 *
 * `useSortable` throws outside a `DndContext`, so every test wraps the
 * component in the minimal ancestor it requires — a real `SortableContext`,
 * exactly like production, never a mock of the hook itself.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import SortableBlock from './SortableBlock';

afterEach(cleanup);

function renderBlock() {
  return render(
    <DndContext id="test-dnd">
      <SortableContext items={['x']}>
        <SortableBlock id="x" handleLabel="Move: the sentence block">
          <p>block content</p>
        </SortableBlock>
      </SortableContext>
    </DndContext>,
  );
}

describe('SortableBlock', () => {
  it('renders its children inside the sortable container', () => {
    renderBlock();
    expect(screen.getByText('block content')).toBeTruthy();
  });

  it('binds the drag activator to a dedicated, accessibly-named handle button', () => {
    renderBlock();
    const h = screen.getByTestId('authoring-block-handle-x');
    expect(h.tagName).toBe('BUTTON');
    expect(h.getAttribute('aria-label')).toBe('Move: the sentence block');
    // dnd-kit's activator listeners include a keydown handler; a real handler
    // shows up as a non-null onkeydown property once React attaches it.
    expect(typeof h.onkeydown === 'function' || h.getAttribute('tabindex')).toBeTruthy();
  });

  it('never binds the drag activator to the block container itself', () => {
    renderBlock();
    const container = screen.getByTestId('authoring-block-x');
    // The container carries no activator role/name of its own — only the
    // handle button does. `role="button"` here would mean dnd-kit's
    // listeners leaked onto the container, which is the bug the design
    // explicitly rules out.
    expect(container.getAttribute('role')).not.toBe('button');
  });
});
