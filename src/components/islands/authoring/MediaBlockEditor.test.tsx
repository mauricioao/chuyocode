// @vitest-environment jsdom
/**
 * MediaBlockEditor — enforces the media URL policy (exerciseMedia.ts) at
 * entry: only an empty value or an allow-listed https URL is committed to
 * the draft via onChange*.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MediaBlock } from '@/lib/exercisePayload';
import MediaBlockEditor from './MediaBlockEditor';

afterEach(cleanup);

const BLOCK: MediaBlock = { kind: 'media', id: 'm1' };

describe('MediaBlockEditor', () => {
  it('commits an allow-listed https image URL', () => {
    const onChangeImage = vi.fn();
    render(
      <MediaBlockEditor
        block={BLOCK}
        lang="en"
        onChangeImage={onChangeImage}
        onChangeAudio={vi.fn()}
        onChangeAlt={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('media-image-m1'), {
      target: { value: 'https://cdn.sanity.io/images/proj/production/cat.png' },
    });

    expect(onChangeImage).toHaveBeenCalledWith(
      'https://cdn.sanity.io/images/proj/production/cat.png',
    );
    expect(screen.queryByTestId('media-image-error-m1')).toBeNull();
  });

  it('never commits a javascript: URL, and shows an inline error', () => {
    const onChangeImage = vi.fn();
    render(
      <MediaBlockEditor
        block={BLOCK}
        lang="en"
        onChangeImage={onChangeImage}
        onChangeAudio={vi.fn()}
        onChangeAlt={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('media-image-m1'), {
      target: { value: 'javascript:alert(1)' },
    });

    expect(onChangeImage).not.toHaveBeenCalled();
    expect(screen.getByTestId('media-image-error-m1')).toBeTruthy();
    // The field still reflects exactly what was typed, so the author can see
    // and correct it — it just never reached the draft.
    expect((screen.getByTestId('media-image-m1') as HTMLInputElement).value).toBe(
      'javascript:alert(1)',
    );
  });

  it('never commits an http (non-https) URL', () => {
    const onChangeAudio = vi.fn();
    render(
      <MediaBlockEditor
        block={BLOCK}
        lang="en"
        onChangeImage={vi.fn()}
        onChangeAudio={onChangeAudio}
        onChangeAlt={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('media-audio-m1'), {
      target: { value: 'http://cdn.sanity.io/a.mp3' },
    });

    expect(onChangeAudio).not.toHaveBeenCalled();
    expect(screen.getByTestId('media-audio-error-m1')).toBeTruthy();
  });

  it('clearing the field commits undefined', () => {
    const onChangeImage = vi.fn();
    render(
      <MediaBlockEditor
        block={{ ...BLOCK, image: 'https://cdn.sanity.io/a.png' }}
        lang="en"
        onChangeImage={onChangeImage}
        onChangeAudio={vi.fn()}
        onChangeAlt={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('media-image-m1'), { target: { value: '' } });
    expect(onChangeImage).toHaveBeenCalledWith(undefined);
  });

  it('commits alt text freely, with no URL policy applied', () => {
    const onChangeAlt = vi.fn();
    render(
      <MediaBlockEditor
        block={BLOCK}
        lang="en"
        onChangeImage={vi.fn()}
        onChangeAudio={vi.fn()}
        onChangeAlt={onChangeAlt}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('media-alt-m1'), { target: { value: 'a cat' } });
    expect(onChangeAlt).toHaveBeenCalledWith('a cat');
  });

  it('calls onRemove when the remove control is pressed', () => {
    const onRemove = vi.fn();
    render(
      <MediaBlockEditor
        block={BLOCK}
        lang="en"
        onChangeImage={vi.fn()}
        onChangeAudio={vi.fn()}
        onChangeAlt={vi.fn()}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByTestId('remove-block-m1'));
    expect(onRemove).toHaveBeenCalled();
  });
});
