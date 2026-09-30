import { describe, it, expect } from 'vitest';
import { renderLessonMarkdown } from './markdown';

describe('renderLessonMarkdown', () => {
  it('renders basic formatting', () => {
    const html = renderLessonMarkdown('**hola** y *mundo*');
    expect(html).toContain('<strong>hola</strong>');
    expect(html).toContain('<em>mundo</em>');
  });

  it('renders headings, lists, and links', () => {
    const html = renderLessonMarkdown('# Título\n\n- uno\n- dos\n\n[ver](https://example.com)');
    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>uno</li>');
    expect(html).toContain('href="https://example.com"');
  });

  it('adds rel="noopener noreferrer" and target="_blank" to every link', () => {
    const html = renderLessonMarkdown('[ver](https://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('strips a raw <script> tag entirely', () => {
    const html = renderLessonMarkdown('hola <script>alert(1)</script> mundo');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('strips a raw <iframe> tag', () => {
    const html = renderLessonMarkdown('<iframe src="https://evil.example.com"></iframe>');
    expect(html).not.toContain('<iframe');
  });

  it('strips event handler attributes from an inline HTML tag', () => {
    const html = renderLessonMarkdown('<img src="x.png" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('strips a javascript: URL from a link', () => {
    const html = renderLessonMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('strips a style attribute (not in the allowlist)', () => {
    const html = renderLessonMarkdown('<p style="color:red">hola</p>');
    expect(html).not.toContain('style=');
  });

  it('keeps an https image but drops disallowed attributes', () => {
    const html = renderLessonMarkdown('<img src="https://example.com/x.png" alt="x" onclick="evil()">');
    expect(html).toContain('src="https://example.com/x.png"');
    expect(html).not.toContain('onclick');
  });
});
