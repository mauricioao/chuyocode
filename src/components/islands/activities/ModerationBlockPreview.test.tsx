// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ModerationBlockPreview from './ModerationBlockPreview';
import type { Block } from '@/lib/activities/blocks';

afterEach(() => cleanup());

const resolveImageUrl = (path: string) => `/api/actividades/imagen?path=${encodeURIComponent(path)}`;

const WORKSHEET: Block = {
  id: 'w1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-uploads/author/img.webp', width: 800, height: 600 },
  zones: [
    { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['gato', 'cat'] },
    { id: 'z2', x: 0.4, y: 0.1, w: 0.2, h: 0.1, kind: 'choice', answers: ['b'], options: ['a', 'b', 'c'] },
  ],
};

const QUIZ: Block = {
  id: 'q1',
  type: 'quiz',
  payload: {
    pools: { opts: [{ id: 'a', text: 'perro' }] },
    slots: [{ id: 's1', label: 'Elegir el animal', input: 'choice', pool: 'opts', answer: ['a'] }],
  },
};

describe('ModerationBlockPreview — worksheet', () => {
  it('renders the image via resolveImageUrl', () => {
    render(<ModerationBlockPreview lang="es" block={WORKSHEET} resolveImageUrl={resolveImageUrl} showAnswers={false} />);
    const img = screen.getByTestId('moderation-block-image') as HTMLImageElement;
    expect(img.src).toContain(encodeURIComponent(WORKSHEET.type === 'worksheet' ? WORKSHEET.image.path : ''));
  });

  it('lists every zone without answers when showAnswers is false', () => {
    render(<ModerationBlockPreview lang="es" block={WORKSHEET} resolveImageUrl={resolveImageUrl} showAnswers={false} />);
    expect(screen.getByTestId('moderation-zone-z1').textContent).not.toContain('gato');
  });

  it('shows the answers and options when showAnswers is true', () => {
    render(<ModerationBlockPreview lang="es" block={WORKSHEET} resolveImageUrl={resolveImageUrl} showAnswers />);
    expect(screen.getByTestId('moderation-zone-z1').textContent).toContain('gato / cat');
    expect(screen.getByTestId('moderation-zone-z2').textContent).toContain('a / b / c');
  });
});

describe('ModerationBlockPreview — explanation (D5, "¿Por qué?")', () => {
  const WORKSHEET_WITH_EXPLANATION: Block = {
    ...(WORKSHEET as Extract<Block, { type: 'worksheet' }>),
    zones: [
      { ...(WORKSHEET as Extract<Block, { type: 'worksheet' }>).zones[0], explanation: 'Because it is the animal.' },
      (WORKSHEET as Extract<Block, { type: 'worksheet' }>).zones[1],
    ],
  };

  const QUIZ_WITH_EXPLANATION: Block = {
    ...(QUIZ as Extract<Block, { type: 'quiz' }>),
    payload: {
      ...(QUIZ as Extract<Block, { type: 'quiz' }>).payload,
      slots: [
        {
          ...(QUIZ as Extract<Block, { type: 'quiz' }>).payload.slots[0],
          explanation: 'A "perro" is a dog.',
        },
      ],
    },
  };

  it('hides a zone explanation when showAnswers is false', () => {
    render(
      <ModerationBlockPreview lang="es" block={WORKSHEET_WITH_EXPLANATION} resolveImageUrl={resolveImageUrl} showAnswers={false} />,
    );
    expect(screen.getByTestId('moderation-zone-z1').textContent).not.toContain('Because it is the animal.');
  });

  it('shows a zone explanation alongside the answers when showAnswers is true', () => {
    render(
      <ModerationBlockPreview lang="es" block={WORKSHEET_WITH_EXPLANATION} resolveImageUrl={resolveImageUrl} showAnswers />,
    );
    expect(screen.getByTestId('moderation-zone-z1').textContent).toContain('Because it is the animal.');
  });

  it('shows nothing extra for a zone with no explanation', () => {
    render(<ModerationBlockPreview lang="es" block={WORKSHEET} resolveImageUrl={resolveImageUrl} showAnswers />);
    expect(screen.getByTestId('moderation-zone-z2').textContent).not.toContain('undefined');
  });

  it('hides a quiz slot explanation when showAnswers is false', () => {
    render(
      <ModerationBlockPreview lang="es" block={QUIZ_WITH_EXPLANATION} resolveImageUrl={resolveImageUrl} showAnswers={false} />,
    );
    expect(screen.getByTestId('moderation-slot-s1').textContent).not.toContain('A "perro" is a dog.');
  });

  it('shows a quiz slot explanation alongside the answer when showAnswers is true', () => {
    render(
      <ModerationBlockPreview lang="es" block={QUIZ_WITH_EXPLANATION} resolveImageUrl={resolveImageUrl} showAnswers />,
    );
    expect(screen.getByTestId('moderation-slot-s1').textContent).toContain('A "perro" is a dog.');
  });
});

describe('ModerationBlockPreview — quiz', () => {
  it('lists every slot label', () => {
    render(<ModerationBlockPreview lang="es" block={QUIZ} resolveImageUrl={resolveImageUrl} showAnswers={false} />);
    expect(screen.getByTestId('moderation-slot-s1').textContent).toContain('Elegir el animal');
  });

  it('resolves and shows the correct answer when showAnswers is true', () => {
    render(<ModerationBlockPreview lang="es" block={QUIZ} resolveImageUrl={resolveImageUrl} showAnswers />);
    expect(screen.getByTestId('moderation-slot-s1').textContent).toContain('perro');
  });

  it('hides the answer when showAnswers is false', () => {
    render(<ModerationBlockPreview lang="es" block={QUIZ} resolveImageUrl={resolveImageUrl} showAnswers={false} />);
    expect(screen.getByTestId('moderation-slot-s1').textContent).not.toContain('perro');
  });
});
