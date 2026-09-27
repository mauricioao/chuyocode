// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorksheetPlayer from './WorksheetPlayer';
import type { Zone } from '@/lib/activities/blocks';

const IMAGE = { path: 'activity-images/act-1/img-1.webp', width: 800, height: 400 };

const TEXT_ZONE: Zone = { id: 'z1', x: 0.1, y: 0.2, w: 0.3, h: 0.1, kind: 'text', answers: ['sat'] };
const CHOICE_ZONE: Zone = {
  id: 'z2',
  x: 0.5,
  y: 0.5,
  w: 0.2,
  h: 0.1,
  kind: 'choice',
  answers: ['b'],
  options: ['a', 'b', 'c'],
};

describe('WorksheetPlayer', () => {
  it('renders the image', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[]} imageUrl="/img.webp" />);
    const img = screen.getByTestId('worksheet-player').querySelector('img') as HTMLImageElement;
    expect(img.src).toContain('/img.webp');
  });

  it('shows the not-graded notice', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[]} imageUrl="/img.webp" />);
    expect(screen.getByTestId('worksheet-player').textContent).toContain('no corrige');
  });

  it('shows the English not-graded notice', () => {
    render(<WorksheetPlayer lang="en" image={IMAGE} zones={[]} imageUrl="/img.webp" />);
    expect(screen.getByTestId('worksheet-player').textContent).toContain('does not grade');
  });

  it('renders a text input for a text zone, positioned by its fractional rect', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[TEXT_ZONE]} imageUrl="/img.webp" />);
    const wrapper = screen.getByTestId('player-zone-z1');
    expect(wrapper.style.left).toBe('10%');
    expect(wrapper.style.top).toBe('20%');
    expect(wrapper.style.width).toBe('30%');
    expect(wrapper.style.height).toBe('10%');
    expect(wrapper.querySelector('input[type="text"]')).toBeTruthy();
  });

  it('renders a select with its options for a choice zone', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[CHOICE_ZONE]} imageUrl="/img.webp" />);
    const wrapper = screen.getByTestId('player-zone-z2');
    const select = wrapper.querySelector('select');
    expect(select).toBeTruthy();
    const optionValues = Array.from(select?.querySelectorAll('option') ?? []).map((o) => o.value);
    expect(optionValues).toEqual(['', 'a', 'b', 'c']);
  });

  it('renders neither input nor select values pre-filled (not graded, blank start)', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[TEXT_ZONE]} imageUrl="/img.webp" />);
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});
