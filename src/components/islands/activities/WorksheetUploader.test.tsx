// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

const pipelineMocks = vi.hoisted(() => ({
  routeFileType: vi.fn(),
  validatePageSelection: vi.fn(),
  convertImageToWebp: vi.fn(),
  convertPdfPagesToWebp: vi.fn(),
}));

vi.mock('@/lib/activities/imagePipeline', async () => {
  const actual = await vi.importActual<typeof import('@/lib/activities/imagePipeline')>(
    '@/lib/activities/imagePipeline',
  );
  return {
    ...actual,
    routeFileType: pipelineMocks.routeFileType,
    validatePageSelection: pipelineMocks.validatePageSelection,
    convertImageToWebp: pipelineMocks.convertImageToWebp,
    convertPdfPagesToWebp: pipelineMocks.convertPdfPagesToWebp,
  };
});

import WorksheetUploader from './WorksheetUploader';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function imageFile(name = 'photo.png', type = 'image/png') {
  return new File(['x'], name, { type });
}

function pdfFile(name = 'doc.pdf') {
  return new File(['x'], name, { type: 'application/pdf' });
}

function selectFile(file: File) {
  const input = screen.getByTestId('worksheet-file-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('WorksheetUploader — image upload', () => {
  it('converts and uploads an image, then calls onComplete with the result', async () => {
    pipelineMocks.routeFileType.mockReturnValue('image');
    pipelineMocks.convertImageToWebp.mockResolvedValue(new Blob(['webp']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ path: 'activity-uploads/u1/a.webp', width: 800, height: 600 }),
      }),
    );
    const onComplete = vi.fn();

    render(<WorksheetUploader lang="es" onComplete={onComplete} />);
    await act(async () => {
      selectFile(imageFile());
    });

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { path: 'activity-uploads/u1/a.webp', width: 800, height: 600 },
      ]),
    );
  });

  it('shows a friendly error when the upload endpoint rejects the file', async () => {
    pipelineMocks.routeFileType.mockReturnValue('image');
    pipelineMocks.convertImageToWebp.mockResolvedValue(new Blob(['webp']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_dimensions' }) }),
    );

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(imageFile());
    });

    expect(await screen.findByTestId('uploader-error')).toHaveProperty(
      'textContent',
      'La imagen debe medir entre 200 y 2400 píxeles de lado.',
    );
  });

  it('shows an unsupported-type error for a file the pipeline does not route', async () => {
    pipelineMocks.routeFileType.mockReturnValue(null);

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(new File(['x'], 'doc.txt', { type: 'text/plain' }));
    });

    expect(await screen.findByTestId('uploader-error')).toBeTruthy();
    expect(pipelineMocks.convertImageToWebp).not.toHaveBeenCalled();
  });
});

describe('WorksheetUploader — PDF page selection', () => {
  it('asks for a page selection before converting a PDF', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });

    expect(screen.getByTestId('worksheet-uploader-pages')).toBeTruthy();
    expect(pipelineMocks.convertPdfPagesToWebp).not.toHaveBeenCalled();
  });

  it('converts and uploads each chosen page, in order, on confirm', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.validatePageSelection.mockReturnValue([1, 3]);
    pipelineMocks.convertPdfPagesToWebp.mockResolvedValue([new Blob(['p1']), new Blob(['p3'])]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ path: 'p1.webp', width: 100, height: 100 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ path: 'p3.webp', width: 100, height: 100 }) });
    vi.stubGlobal('fetch', fetchMock);
    const onComplete = vi.fn();

    render(<WorksheetUploader lang="es" onComplete={onComplete} />);
    await act(async () => {
      selectFile(pdfFile());
    });
    fireEvent.change(screen.getByTestId('pdf-pages-input'), { target: { value: '1, 3' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('pdf-pages-confirm'));
    });

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { path: 'p1.webp', width: 100, height: 100 },
        { path: 'p3.webp', width: 100, height: 100 },
      ]),
    );
  });

  it('shows an error for an invalid page selection without calling the pipeline', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.validatePageSelection.mockReturnValue(null);

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });
    fireEvent.change(screen.getByTestId('pdf-pages-input'), { target: { value: 'not-a-page' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('pdf-pages-confirm'));
    });

    expect(await screen.findByTestId('uploader-error')).toBeTruthy();
    expect(pipelineMocks.convertPdfPagesToWebp).not.toHaveBeenCalled();
  });
});

describe('WorksheetUploader — drag and drop', () => {
  it('accepts a dropped file', async () => {
    pipelineMocks.routeFileType.mockReturnValue('image');
    pipelineMocks.convertImageToWebp.mockResolvedValue(new Blob(['webp']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ path: 'x.webp', width: 300, height: 300 }) }),
    );
    const onComplete = vi.fn();

    render(<WorksheetUploader lang="es" onComplete={onComplete} />);
    const dropzone = screen.getByTestId('worksheet-uploader');
    await act(async () => {
      fireEvent.drop(dropzone, { dataTransfer: { files: [imageFile()] } });
    });

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});
