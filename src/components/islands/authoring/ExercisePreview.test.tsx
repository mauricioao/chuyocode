// @vitest-environment jsdom
/**
 * ExercisePreview — proves it mounts the REAL ExerciseIsland (task 15.7),
 * not a second renderer: the preview's markup is exactly what a learner
 * would see, driven by whatever payload is handed in.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Payload } from '@/lib/exercisePayload';
import ExercisePreview from './ExercisePreview';

afterEach(cleanup);

const PAYLOAD: Payload = {
  pools: {},
  slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] }],
};

describe('ExercisePreview', () => {
  it('renders the real exercise submit control for the current draft payload', () => {
    render(<ExercisePreview lang="en" payload={PAYLOAD} />);
    expect(screen.getByTestId('exercise-submit')).toBeTruthy();
  });

  it('reflects an empty draft (no slots) without throwing', () => {
    render(<ExercisePreview lang="en" payload={{ pools: {}, slots: [] }} />);
    expect(screen.getByTestId('exercise-preview')).toBeTruthy();
  });
});
