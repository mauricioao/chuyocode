import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import BookCard from './BookCard.astro';

// Spec 7 — Scenario: BookCard renders.
// GIVEN title, cover URL, and author, WHEN <BookCard> renders, THEN title,
// image (with correct alt text), and author are visible, and the card links
// to href.
describe('BookCard.astro', () => {
  const props = {
    title: 'Clean Architecture',
    coverUrl: 'https://cdn.example.com/clean.jpg',
    author: 'Robert C. Martin',
    href: '/es/libros/clean-architecture',
  };

  it('renders the title, author, and cover image', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(BookCard, { props });
    expect(html).toContain('Clean Architecture');
    expect(html).toContain('Robert C. Martin');
    expect(html).toContain('src="https://cdn.example.com/clean.jpg"');
  });

  it('sets accessible alt text derived from the title', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(BookCard, { props });
    expect(html).toContain('alt="Portada de Clean Architecture"');
  });

  it('links the card to the provided href', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(BookCard, { props });
    expect(html).toContain('href="/es/libros/clean-architecture"');
  });

  it('uses no inline style attributes (Tailwind-only)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(BookCard, { props });
    expect(html).not.toMatch(/style=/);
  });
});
