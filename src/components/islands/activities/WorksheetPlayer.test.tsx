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

describe('WorksheetPlayer — rotation (creator polish round 2)', () => {
  it('swaps the container aspect ratio for a 90deg rotation', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[]} imageUrl="/img.webp" rotation={90} />);
    const container = screen.getByTestId('worksheet-player').querySelector('div.relative') as HTMLElement;
    // IMAGE is 800x400 -> rotated 90deg the displayed size is 400x800.
    expect(container.style.aspectRatio).toBe('400 / 800');
  });

  it('keeps the container aspect ratio unchanged for a 180deg rotation', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[]} imageUrl="/img.webp" rotation={180} />);
    const container = screen.getByTestId('worksheet-player').querySelector('div.relative') as HTMLElement;
    expect(container.style.aspectRatio).toBe('800 / 400');
  });

  it('positions a zone by the same fractional rect regardless of rotation (already in the rotated space)', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[TEXT_ZONE]} imageUrl="/img.webp" rotation={270} />);
    const wrapper = screen.getByTestId('player-zone-z1');
    expect(wrapper.style.left).toBe('10%');
    expect(wrapper.style.top).toBe('20%');
  });
});
