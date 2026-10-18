// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PromptImage from './PromptImage';

afterEach(cleanup);

describe('PromptImage', () => {
  it('renders nothing when there is no image', () => {
    const { container } = render(<PromptImage image={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a decorative, display-only image with the stable default testid', () => {
    render(
      <PromptImage image={{ path: 'activity-images/act-1/question-img.webp', width: 400, height: 300 }} />,
    );
    const img = screen.getByTestId('prompt-image');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('src')).toContain(encodeURIComponent('activity-images/act-1/question-img.webp'));
  });

  it('accepts a caller-supplied testid override (the default "quiz" mode needs one per slot)', () => {
    render(
      <PromptImage
        image={{ path: 'activity-images/act-1/question-img.webp', width: 400, height: 300 }}
        data-testid="quiz-slot-prompt-image-s1"
      />,
    );
    expect(screen.getByTestId('quiz-slot-prompt-image-s1')).toBeTruthy();
    expect(screen.queryByTestId('prompt-image')).toBeNull();
  });
});
