// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

const pipelineMocks = vi.hoisted(() => ({
  routeFileType: vi.fn(),
  validatePageSelection: vi.fn(),
  convertImageToWebp: vi.fn(),
  renderPdfThumbnails: vi.fn(),
  openPdfForConversion: vi.fn(),
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
    renderPdfThumbnails: pipelineMocks.renderPdfThumbnails,
    openPdfForConversion: pipelineMocks.openPdfForConversion,
  };
});

import WorksheetUploader from './WorksheetUploader';

// jsdom does not implement `URL.createObjectURL`/`revokeObjectURL` — defined
// once here (real implementations, not test-local) so `vi.spyOn` below has
// something to wrap; every test that renders the thumbnail grid stubs a
// deterministic return value.
if (typeof URL.createObjectURL !== 'function') {
  (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = () => '';
}
if (typeof URL.revokeObjectURL !== 'function') {
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = () => {};
}

beforeEach(() => {
  let counter = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:mock-${counter++}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

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

/** A `renderPdfThumbnails` resolution with `count` pages, none truncated unless overridden. */
function thumbnailsResult(count: number, overrides: { truncated?: boolean; totalPages?: number } = {}) {
  return {
    thumbnails: Array.from({ length: count }, (_, i) => ({
      pageNumber: i + 1,
      blob: new Blob([`page-${i + 1}`]),
      width: 90,
      height: 120,
    })),
    totalPages: overrides.totalPages ?? count,
    truncated: overrides.truncated ?? false,
  };
}

/** A `PdfPageConverter`-shaped mock — `convertPage` defaults to a deterministic per-page blob. */
function converterMock(totalPages: number, convertPage?: (pageNumber: number) => Promise<Blob>) {
  return {
    totalPages,
    convertPage: vi.fn(convertPage ?? (async (pageNumber: number) => new Blob([`page-${pageNumber}`]))),
    dispose: vi.fn(async () => {}),
  };
}

function fetchOkSequence(paths: string[]) {
  const impl = vi.fn();
  for (const path of paths) {
    impl.mockResolvedValueOnce({ ok: true, json: async () => ({ path, width: 100, height: 100 }) });
  }
  return impl;
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
    // Back to the empty drop zone once done.
    expect(screen.getByTestId('worksheet-uploader')).toBeTruthy();
  });

  it('shows the task panel (never a bare "Cargando…") while an image converts/uploads', async () => {
    pipelineMocks.routeFileType.mockReturnValue('image');
    let resolveConvert!: (blob: Blob) => void;
    pipelineMocks.convertImageToWebp.mockReturnValue(
      new Promise((resolve) => {
        resolveConvert = resolve;
      }),
    );

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(imageFile());
    });

    expect(screen.queryByTestId('worksheet-uploader')).toBeNull();
    expect(screen.getByTestId('task-progress-label').textContent).toBe('Optimizando imagen 1 de 1');

    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      ),
    );
    await act(async () => {
      resolveConvert(new Blob(['webp']));
    });
    expect(screen.getByTestId('task-progress-label').textContent).toBe('Subiendo 1 de 1');
    expect(screen.queryByTestId('worksheet-uploader')).toBeNull();

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ path: 'x', width: 1, height: 1 }) });
    });
    await waitFor(() => expect(screen.getByTestId('worksheet-uploader')).toBeTruthy());
  });

  it('shows a friendly error when the upload endpoint rejects the file, with retry/choose-another', async () => {
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

    expect(await screen.findByTestId('task-progress-error')).toHaveProperty(
      'textContent',
      'La imagen debe medir entre 200 y 2400 píxeles de lado.',
    );
    expect(screen.getByTestId('task-progress-retry')).toBeTruthy();
    expect(screen.getByTestId('task-progress-choose-another')).toBeTruthy();

    fireEvent.click(screen.getByTestId('task-progress-choose-another'));
    expect(screen.getByTestId('worksheet-uploader')).toBeTruthy();
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

describe('WorksheetUploader — PDF page thumbnails', () => {
  it('shows a loading state, then the thumbnail grid once rendering resolves', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    let resolveThumbnails!: (value: ReturnType<typeof thumbnailsResult>) => void;
    pipelineMocks.renderPdfThumbnails.mockReturnValue(
      new Promise((resolve) => {
        resolveThumbnails = resolve;
      }),
    );

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });
    expect(screen.getByTestId('worksheet-uploader-pdf-loading')).toBeTruthy();

    await act(async () => {
      resolveThumbnails(thumbnailsResult(3));
    });
    expect(screen.getByTestId('worksheet-uploader-thumbnails')).toBeTruthy();
    expect(screen.getByTestId('pdf-thumbnail-1')).toBeTruthy();
    expect(screen.getByTestId('pdf-thumbnail-2')).toBeTruthy();
    expect(screen.getByTestId('pdf-thumbnail-3')).toBeTruthy();
    expect(pipelineMocks.openPdfForConversion).not.toHaveBeenCalled();
  });

  it('selects a page via its checkbox and shows the running count', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockResolvedValue(thumbnailsResult(3));

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });

    expect(screen.getByTestId('pdf-selected-count').textContent).toContain('0/10');
    fireEvent.click(screen.getByTestId('pdf-thumbnail-checkbox-1'));
    expect(screen.getByTestId('pdf-selected-count').textContent).toContain('1/10');
    fireEvent.click(screen.getByTestId('pdf-thumbnail-checkbox-1')); // toggles off
    expect(screen.getByTestId('pdf-selected-count').textContent).toContain('0/10');
  });

  it('caps selection at 10 pages — an 11th checkbox stays disabled', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockResolvedValue(thumbnailsResult(12));

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });

    for (let page = 1; page <= 10; page++) {
      fireEvent.click(screen.getByTestId(`pdf-thumbnail-checkbox-${page}`));
    }
    expect(screen.getByTestId('pdf-selected-count').textContent).toContain('10/10');
    const eleventh = screen.getByTestId('pdf-thumbnail-checkbox-11') as HTMLInputElement;
    expect(eleventh.disabled).toBe(true);
    fireEvent.click(eleventh);
    expect(screen.getByTestId('pdf-selected-count').textContent).toContain('10/10');
  });

  it('"Seleccionar todas" selects up to 10 pages, in order', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockResolvedValue(thumbnailsResult(15));

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });

    fireEvent.click(screen.getByTestId('pdf-select-all'));
    expect(screen.getByTestId('pdf-selected-count').textContent).toContain('10/10');
    expect((screen.getByTestId('pdf-thumbnail-checkbox-1') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('pdf-thumbnail-checkbox-10') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('pdf-thumbnail-checkbox-11') as HTMLInputElement).checked).toBe(false);
  });

  it('shows a note when the PDF has more pages than the thumbnail cap', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockResolvedValue(thumbnailsResult(40, { truncated: true, totalPages: 55 }));

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });

    expect(screen.getByTestId('pdf-thumbnails-truncated-note')).toBeTruthy();
  });

  it('does not show the truncated note when the PDF fits under the cap', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockResolvedValue(thumbnailsResult(3));

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });

    expect(screen.queryByTestId('pdf-thumbnails-truncated-note')).toBeNull();
  });

  it('the confirm button is disabled with nothing selected, and labeled with the selected count', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockResolvedValue(thumbnailsResult(3));

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });

    const confirm = screen.getByTestId('pdf-thumbnails-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('pdf-thumbnail-checkbox-1'));
    fireEvent.click(screen.getByTestId('pdf-thumbnail-checkbox-2'));
    expect(confirm.disabled).toBe(false);
    expect(confirm.textContent).toContain('2');
  });

  it('converts and uploads the selected pages, in order, through converting/uploading stages, never showing the drop zone again until done', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockResolvedValue(thumbnailsResult(3));
    pipelineMocks.validatePageSelection.mockImplementation((pages: unknown) =>
      Array.isArray(pages) ? pages : null,
    );
    const converter = converterMock(3);
    pipelineMocks.openPdfForConversion.mockResolvedValue(converter);
    vi.stubGlobal('fetch', fetchOkSequence(['p1.webp', 'p3.webp']));
    const onComplete = vi.fn();

    render(<WorksheetUploader lang="es" onComplete={onComplete} />);
    await act(async () => {
      selectFile(pdfFile());
    });
    // Click out of order — the confirm handler sorts before converting.
    fireEvent.click(screen.getByTestId('pdf-thumbnail-checkbox-3'));
    fireEvent.click(screen.getByTestId('pdf-thumbnail-checkbox-1'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('pdf-thumbnails-confirm'));
    });

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { path: 'p1.webp', width: 100, height: 100 },
        { path: 'p3.webp', width: 100, height: 100 },
      ]),
    );
    expect(converter.convertPage).toHaveBeenNthCalledWith(1, 1, expect.any(AbortSignal));
    expect(converter.convertPage).toHaveBeenNthCalledWith(2, 3, expect.any(AbortSignal));
    expect(converter.dispose).toHaveBeenCalledOnce();
    expect(screen.getByTestId('worksheet-uploader')).toBeTruthy();
  });

  it('cancels mid-task, going straight back to the drop zone and keeping any page already uploaded', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockResolvedValue(thumbnailsResult(2));
    pipelineMocks.validatePageSelection.mockImplementation((pages: unknown) =>
      Array.isArray(pages) ? pages : null,
    );
    let resolveSecondConvert!: (blob: Blob) => void;
    let convertCalls = 0;
    const converter = converterMock(2, async (pageNumber) => {
      convertCalls += 1;
      if (convertCalls === 2) {
        return new Promise<Blob>((resolve) => {
          resolveSecondConvert = resolve;
        });
      }
      return new Blob([`page-${pageNumber}`]);
    });
    pipelineMocks.openPdfForConversion.mockResolvedValue(converter);
    vi.stubGlobal('fetch', fetchOkSequence(['p1.webp']));
    const onComplete = vi.fn();

    render(<WorksheetUploader lang="es" onComplete={onComplete} />);
    await act(async () => {
      selectFile(pdfFile());
    });
    fireEvent.click(screen.getByTestId('pdf-select-all'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('pdf-thumbnails-confirm'));
    });

    await waitFor(() => expect(convertCalls).toBe(2));
    expect(screen.getByTestId('task-progress-cancel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('task-progress-cancel'));

    // The in-flight conversion is cooperative (pdfjs can't be interrupted
    // mid-render) — the task only actually stops once that await resolves
    // and the run loop notices the signal is aborted.
    await act(async () => {
      resolveSecondConvert(new Blob(['page-2']));
    });

    await waitFor(() => expect(screen.getByTestId('worksheet-uploader')).toBeTruthy());
    expect(onComplete).not.toHaveBeenCalled();
    expect(converter.dispose).toHaveBeenCalledOnce();
  });

  it('a failure on page 3 stops at the task error state, and Reintentar resumes AT page 3 without re-uploading pages 1-2', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockResolvedValue(thumbnailsResult(3));
    pipelineMocks.validatePageSelection.mockImplementation((pages: unknown) =>
      Array.isArray(pages) ? pages : null,
    );
    let attempt = 0;
    const converter = converterMock(3, async (pageNumber) => {
      if (pageNumber === 3) {
        attempt += 1;
        if (attempt === 1) throw new Error('network');
      }
      return new Blob([`page-${pageNumber}`]);
    });
    pipelineMocks.openPdfForConversion.mockResolvedValue(converter);
    vi.stubGlobal('fetch', fetchOkSequence(['p1.webp', 'p2.webp', 'p3.webp']));
    const onComplete = vi.fn();

    render(<WorksheetUploader lang="es" onComplete={onComplete} />);
    await act(async () => {
      selectFile(pdfFile());
    });
    fireEvent.click(screen.getByTestId('pdf-select-all'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('pdf-thumbnails-confirm'));
    });

    expect(await screen.findByTestId('task-progress-error')).toHaveProperty(
      'textContent',
      'No se pudo subir el archivo. Intentar de nuevo.',
    );
    expect(screen.queryByTestId('task-progress-cancel')).toBeNull();
    expect(screen.queryByTestId('worksheet-uploader')).toBeNull(); // never falls back while blocked on an error either

    await act(async () => {
      fireEvent.click(screen.getByTestId('task-progress-retry'));
    });

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { path: 'p1.webp', width: 100, height: 100 },
        { path: 'p2.webp', width: 100, height: 100 },
        { path: 'p3.webp', width: 100, height: 100 },
      ]),
    );
    expect(attempt).toBe(2); // page 3 converted twice (fail, then retry); pages 1-2 only once each
    expect(converter.convertPage).toHaveBeenCalledTimes(4); // p1, p2, p3 (failed), p3 (retried)
  });

  it('falls back to the plain page-number field when thumbnail rendering fails', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockRejectedValue(new Error('pdf_failed'));

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });

    expect(screen.getByTestId('worksheet-uploader-pages')).toBeTruthy();
    expect(screen.queryByTestId('worksheet-uploader-thumbnails')).toBeNull();
  });

  it('switches to the plain page-number field manually via its own button', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockResolvedValue(thumbnailsResult(3));

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });

    fireEvent.click(screen.getByTestId('pdf-switch-to-text'));
    expect(screen.getByTestId('worksheet-uploader-pages')).toBeTruthy();
  });

  it('shows an error when the PDF cannot even be opened for conversion', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockResolvedValue(thumbnailsResult(2));
    pipelineMocks.validatePageSelection.mockImplementation((pages: unknown) =>
      Array.isArray(pages) ? pages : null,
    );
    pipelineMocks.openPdfForConversion.mockRejectedValue(new Error('boom'));

    render(<WorksheetUploader lang="es" onComplete={vi.fn()} />);
    await act(async () => {
      selectFile(pdfFile());
    });
    fireEvent.click(screen.getByTestId('pdf-select-all'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('pdf-thumbnails-confirm'));
    });

    expect(await screen.findByTestId('uploader-error')).toBeTruthy();
  });
});

describe('WorksheetUploader — PDF page number fallback', () => {
  it('converts and uploads each chosen page, in order, on confirm', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockRejectedValue(new Error('pdf_failed'));
    pipelineMocks.validatePageSelection.mockReturnValue([1, 3]);
    const converter = converterMock(3);
    pipelineMocks.openPdfForConversion.mockResolvedValue(converter);
    vi.stubGlobal('fetch', fetchOkSequence(['p1.webp', 'p3.webp']));
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

  it('shows an error for an invalid page selection without opening the PDF for conversion', async () => {
    pipelineMocks.routeFileType.mockReturnValue('pdf');
    pipelineMocks.renderPdfThumbnails.mockRejectedValue(new Error('pdf_failed'));
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
    expect(pipelineMocks.openPdfForConversion).not.toHaveBeenCalled();
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
