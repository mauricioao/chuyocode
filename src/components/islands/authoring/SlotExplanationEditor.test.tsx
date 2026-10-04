// @vitest-environment jsdom
/**
 * SlotExplanationEditor — the optional "¿Por qué?" (D5) field for one slot
 * in the curated-exercise authoring surface.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Slot } from '@/lib/exercisePayload';
import { MAX_SLOT_EXPLANATION_LENGTH } from '@/lib/exercisePayload';
import SlotExplanationEditor from './SlotExplanationEditor';

afterEach(cleanup);

function baseProps(overrides: Partial<Parameters<typeof SlotExplanationEditor>[0]> = {}) {
  return {
    slot: { id: 's1', label: 'x', input: 'text', answer: [] } as Slot,
    lang: 'en',
    onExplanationChange: vi.fn(),
    ...overrides,
  };
}

function textarea(): HTMLTextAreaElement {
  return screen.getByTestId('slot-explanation-input-s1') as HTMLTextAreaElement;
}

describe('SlotExplanationEditor', () => {
  it('renders empty when the slot has no explanation yet', () => {
    render(<SlotExplanationEditor {...baseProps()} />);

    expect(textarea().value).toBe('');
  });

  it('shows an already-authored explanation', () => {
    const slot: Slot = { id: 's1', label: 'x', input: 'text', answer: [], explanation: 'Because.' };
    render(<SlotExplanationEditor {...baseProps({ slot })} />);

    expect(textarea().value).toBe('Because.');
  });

  it('reports every keystroke verbatim, untrimmed', () => {
    const onExplanationChange = vi.fn();
    render(<SlotExplanationEditor {...baseProps({ onExplanationChange })} />);

    fireEvent.change(textarea(), { target: { value: 'Because it is present tense. ' } });

    expect(onExplanationChange).toHaveBeenCalledWith('Because it is present tense. ');
  });

  it('caps input length at MAX_SLOT_EXPLANATION_LENGTH, same cap the payload enforces', () => {
    render(<SlotExplanationEditor {...baseProps()} />);

    expect(textarea().maxLength).toBe(MAX_SLOT_EXPLANATION_LENGTH);
  });

  it('switches label/placeholder/hint copy with lang', () => {
    render(<SlotExplanationEditor {...baseProps({ lang: 'es' })} />);

    expect(screen.getByText('¿Por qué? (explicación)')).toBeTruthy();
    expect(textarea().placeholder).toBe('Explicación opcional');
    expect(screen.getByText('Se muestra al alumno si se equivoca')).toBeTruthy();
  });
});
