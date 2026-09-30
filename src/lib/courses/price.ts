/**
 * Formats a course's lifetime individual-purchase price for display — the
 * catalog badge ("de por vida") and the landing page's disabled purchase
 * CTA ("Comprar de por vida <price>") both go through this, so the two
 * never drift into different currency formatting.
 */
import type { Lang } from '../i18n';

const LOCALE_BY_LANG: Record<Lang, string> = {
  es: 'es',
  en: 'en-US',
};

/** `priceCents` in the smallest currency unit (cents); `currency` an ISO 4217 code (`'USD'`). */
export function formatPrice(priceCents: number, currency: string, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE_BY_LANG[lang], { style: 'currency', currency }).format(priceCents / 100);
}
