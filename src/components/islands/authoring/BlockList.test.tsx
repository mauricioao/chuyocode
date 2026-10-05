// @vitest-environment jsdom
/**
 * BlockList tests — the reorder wiring, not any exercise-domain rule.
 *
 * `BlockList` is deliberately generic (any `{ id: string }` item, an
 * author-supplied `renderItem`), so these tests drive it with a minimal
 * fixture rather than a real `Block` from `exercisePayload.ts` — slice 15
 * wires the real block editors in, this slice only proves the reorder
 * mechanism itself is standalone-demoable.
 *
 * Mirrors `DropRenderer.test.tsx`'s documented limits: jsdom has no layout
 * engine, so a real POINTER drag cannot be proven here. Keyboard reordering
 * end to end is what proves `arrayMove` + `SortableContext` are wired
 * correctly; the pointer sensor's mere presence is asserted structurally.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import BlockList, { type BlockListItem } from './BlockList';

interface Item extends BlockListItem {
  label: string;
}

const ITEMS: Item[] = [
  { id: 'a', label: 'First block' },
  { id: 'b', label: 'Second block' },
  { id: 'c', label: 'Third block' },
];

afterEach(cleanup);

function handle(id: string): HTMLElement {
  return screen.getByTestId(`authoring-block-handle-${id}`);
}

/**
 * Drive a full keyboard reorder: pick the handle up, nudge it, drop it.
 *
 * The `await act` between key presses is load-bearing, not ceremony — see
 * `DropRenderer.test.tsx`'s `placeWithKeyboard` for why: `KeyboardSensor`
 * registers its document-level keydown handler inside a `setTimeout`, so a
 * press dispatched in the same tick would land before the sensor is
 * listening and be silently ignored.
 */
async function moveWithKeyboard(id: string, key: 'ArrowUp' | 'ArrowDown') {
  fireEvent.keyDown(handle(id), { code: 'Space' });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.keyDown(document, { code: key });
  fireEvent.keyDown(document, { code: 'Space' });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('BlockList', () => {
  it('renders every item via renderItem, in order', () => {
    render(
      <BlockList
        items={ITEMS}
        onReorder={vi.fn()}
        handleLabelFor={(item) => `Move: ${item.label}`}
        renderItem={(item) => <p>{item.label}</p>}
      />,
    );

    const list = screen.getByTestId('authoring-block-list');
    expect(Array.from(list.querySelectorAll('p')).map((p) => p.textContent)).toEqual([
      'First block',
      'Second block',
      'Third block',
    ]);
  });

  it('names each drag handle from handleLabelFor, never the block container', () => {
    render(
      <BlockList
        items={ITEMS}
        onReorder={vi.fn()}
        handleLabelFor={(item) => `Move: ${item.label}`}
        renderItem={(item) => <p>{item.label}</p>}
      />,
    );

    const h = handle('b');
    expect(h.tagName).toBe('BUTTON');
    expect(h.getAttribute('aria-label')).toBe('Move: Second block');

    const container = screen.getByTestId('authoring-block-b');
    expect(container.getAttribute('aria-label')).toBeNull();
  });

  it('moves an item up one slot via the keyboard and reports the new order', async () => {
    const onReorder = vi.fn();
    render(
      <BlockList
        items={ITEMS}
        onReorder={onReorder}
        handleLabelFor={(item) => `Move: ${item.label}`}
        renderItem={(item) => <p>{item.label}</p>}
      />,
    );

    await moveWithKeyboard('b', 'ArrowUp');

    expect(onReorder).toHaveBeenCalledWith([
      { id: 'b', label: 'Second block' },
      { id: 'a', label: 'First block' },
      { id: 'c', label: 'Third block' },
    ]);
  });

  /**
   * THE CORE ACCESSIBILITY REQUIREMENT (task 14.1). `{...attributes}
   * {...listeners}` bind to the handle button alone, so a keydown inside a
   * block's own `<textarea>` never reaches the drag activator — it is
   * ordinary text input, not a suppressed gesture.
   */
  it('lets Space typed inside a block textarea type a space, never start a drag', () => {
    const onReorder = vi.fn();
    const onChange = vi.fn();

    render(
      <BlockList
        items={ITEMS}
        onReorder={onReorder}
        handleLabelFor={(item) => `Move: ${item.label}`}
        renderItem={(item) =>
          item.id === 'b' ? (
            <textarea
              data-testid="block-textarea"
              defaultValue="before"
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <p>{item.label}</p>
          )
        }
      />,
    );

    const textarea = screen.getByTestId('block-textarea');
    fireEvent.keyDown(textarea, { code: 'Space' });
    fireEvent.change(textarea, { target: { value: 'before after' } });

    expect(onChange).toHaveBeenCalledWith('before after');
    expect(onReorder).not.toHaveBeenCalled();
  });
});

describe('BlockList — hydration', () => {
  /**
   * This `DndContext` already passes a fixed `id="authoring-block-list"`
   * (one `BlockList` per page — see its own component comment), unlike
   * `QuizBlockEditor.tsx`'s equivalent before its fix. Locked in here so a
   * future edit that drops that `id` prop fails a test instead of only
   * surfacing as a console warning in CI logs — see `hydrationHarness.tsx`.
   */
  it('does not log a console error or recoverable hydration error', async () => {
    const { recoverableErrors, consoleErrors } = await renderThenHydrate(() => (
      <BlockList
        items={ITEMS}
        onReorder={vi.fn()}
        handleLabelFor={(item) => `Move: ${item.label}`}
        renderItem={(item) => <p>{item.label}</p>}
      />
    ));
    expect(recoverableErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
