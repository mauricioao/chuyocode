import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import DeskWeatherWidget from './DeskWeatherWidget.astro';

// Footer simplification ("opción A", owner decision 2026-10-06): the MET
// Norway CC BY 4.0 credit now also sits next to the data it is about, not
// just on `/[lang]/creditos` (`CreditsContent.astro`'s own "Datos del clima"
// section, same URL: https://api.met.no/doc/TermsOfService).
describe('DeskWeatherWidget.astro — MET Norway attribution', () => {
  async function render(attributionLabel: string) {
    const container = await AstroContainer.create();
    return container.renderToString(DeskWeatherWidget, {
      props: {
        lat: -12.05,
        lon: -77.04,
        city: 'Lima',
        label: 'Clima en Lima',
        unavailableLabel: 'Clima no disponible',
        attributionLabel,
      },
    });
  }

  it('renders a muted attribution link to the MET Norway terms of service, in es', async () => {
    const html = await render('Datos: MET Norway');

    expect(html).toContain('Datos: MET Norway');
    expect(html).toMatch(
      /<a[^>]+href="https:\/\/api\.met\.no\/doc\/TermsOfService"[^>]*>\s*Datos: MET Norway/,
    );
  });

  it('renders the localized label in en', async () => {
    const html = await render('Data: MET Norway');

    expect(html).toContain('Data: MET Norway');
  });

  it('opens the attribution link in a new tab safely (noopener noreferrer)', async () => {
    const html = await render('Datos: MET Norway');
    const linkStart = html.indexOf('href="https://api.met.no/doc/TermsOfService"');
    const tagStart = html.lastIndexOf('<a', linkStart);
    const tagEnd = html.indexOf('>', linkStart);
    const openTag = html.slice(tagStart, tagEnd + 1);

    expect(openTag).toContain('target="_blank"');
    expect(openTag).toContain('rel="noopener noreferrer"');
  });

  it('keeps the same widget size (no new column, attribution lives inside the existing shell)', async () => {
    const html = await render('Datos: MET Norway');

    expect(html).toContain('desk:w-[336px]');
    // The attribution link is a child of the same `#desk-weather` shell, not
    // a sibling widget.
    const widgetStart = html.indexOf('id="desk-weather"');
    const widgetOpenEnd = html.indexOf('>', widgetStart);
    const widgetCloseIndex = html.lastIndexOf('</div>');
    const attributionIndex = html.indexOf('https://api.met.no/doc/TermsOfService');

    expect(attributionIndex).toBeGreaterThan(widgetOpenEnd);
    expect(attributionIndex).toBeLessThan(widgetCloseIndex);
  });
});
