// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameItem } from '@/lib/activities/gameModes';
import QuizOpenBox from './QuizOpenBox';

afterEach(cleanup);

const items: GameItem[] = [
  { id: 's1', prompt: 'What is your favorite color?', answer: 'blue' },
  { id: 's2', prompt: 'Where do you live?', answer: 'a house', explanation: 'Any home works.' },
  { id: 's3', prompt: 'What time is it?', answer: 'noon' },
];

describe('QuizOpenBox', () => {
  it('renders one numbered box per item, none opened yet', () => {
    render(<QuizOpenBox lang="es" items={items} />);
    for (let i = 0; i < items.length; i += 1) {
      const box = screen.getByTestId(`openbox-box-${items[i]!.id}`);
      expect(box.textContent).toContain(String(i + 1));
      expect(box.getAttribute('aria-label')).toContain('cerrada');
    }
    expect(screen.queryByTestId('openbox-card')).toBeNull();
  });

  it('opens a box, showing its prompt behind a "Ver respuesta" reveal', () => {
    render(<QuizOpenBox lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('openbox-box-s2'));

    expect(screen.getByTestId('openbox-card').textContent).toContain('Where do you live?');
    expect(screen.queryByTestId('openbox-answer')).toBeNull();

    fireEvent.click(screen.getByTestId('openbox-reveal'));
    const answer = screen.getByTestId('openbox-answer');
    expect(answer.textContent).toContain('a house');
    expect(answer.textContent).toContain('Any home works.');
  });

  it('marks a box "abierta" once opened, and it stays marked after opening another', () => {
    render(<QuizOpenBox lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('openbox-box-s1'));
    fireEvent.click(screen.getByTestId('openbox-box-s2'));

    expect(screen.getByTestId('openbox-box-s1').getAttribute('aria-label')).toContain('abierta');
    expect(screen.getByTestId('openbox-box-s2').getAttribute('aria-label')).toContain('abierta');
    expect(screen.getByTestId('openbox-box-s3').getAttribute('aria-label')).toContain('cerrada');
  });

  it('resets the reveal when switching to a different box', () => {
    render(<QuizOpenBox lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('openbox-box-s1'));
    fireEvent.click(screen.getByTestId('openbox-reveal'));
    expect(screen.getByTestId('openbox-answer')).toBeTruthy();

    fireEvent.click(screen.getByTestId('openbox-box-s2'));
    expect(screen.queryByTestId('openbox-answer')).toBeNull();
  });

  it('re-opens an already-opened box to show its content again', () => {
    render(<QuizOpenBox lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('openbox-box-s1'));
    fireEvent.click(screen.getByTestId('openbox-box-s2'));
    fireEvent.click(screen.getByTestId('openbox-box-s1'));

    expect(screen.getByTestId('openbox-card').textContent).toContain('What is your favorite color?');
  });

  it('announces the opened prompt through the live region', () => {
    render(<QuizOpenBox lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('openbox-box-s3'));
    expect(screen.getByTestId('openbox-live-region').textContent).toBe('What time is it?');
  });

  it('renders nothing for fewer than two items', () => {
    const { container } = render(<QuizOpenBox lang="es" items={[items[0]!]} />);
    expect(container.firstChild).toBeNull();
  });

  it('starts over when the item list changes', () => {
    const { rerender } = render(<QuizOpenBox lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('openbox-box-s1'));
    expect(screen.getByTestId('openbox-card')).toBeTruthy();

    const nextItems: GameItem[] = [
      { id: 'n1', prompt: 'New one?', answer: 'a' },
      { id: 'n2', prompt: 'New two?', answer: 'b' },
    ];
    rerender(<QuizOpenBox lang="es" items={nextItems} />);
    expect(screen.queryByTestId('openbox-card')).toBeNull();
    expect(screen.getByTestId('openbox-box-n1').getAttribute('aria-label')).toContain('cerrada');
  });
});
