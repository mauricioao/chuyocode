/**
 * UiReferenceIsland — the living reference for the premium design system
 * (PR 1), mounted on `/[lang]/admin/ui` (moderators only). Shows every
 * control and state in one place so new work stays consistent with it
 * instead of drifting back into ad-hoc styling.
 *
 * COPY IS LOCAL (not `UI_LABELS`): this page is an internal tool, never
 * linked from ordinary navigation, same justification `SignInForm.COPY`
 * documents for its own local copy — a moderator-only reference screen is
 * not part of the site's public vocabulary surface.
 */
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const COPY = {
  es: {
    inputs: 'Campos de texto',
    textareas: 'Áreas de texto',
    selects: 'Selectores',
    fieldWrapper: 'Field (etiqueta + pista/error)',
    checkboxes: 'Casillas',
    buttons: 'Botones',
    floating: 'Botones flotantes',
    cards: 'Tarjetas',
    toasts: 'Notificaciones (toast)',
    default: 'Normal',
    disabled: 'Deshabilitado',
    invalid: 'Inválido',
    loading: 'Cargando',
    withHint: 'Con pista',
    withError: 'Con error',
    hintText: 'Este campo es opcional.',
    errorText: 'Este campo es obligatorio.',
    placeholder: 'Escribir aquí…',
    cardTitle: 'Título de la tarjeta',
    cardDescription: 'Una descripción corta debajo del título.',
    cardBody: 'El contenido de la tarjeta vive aquí, con el mismo espaciado interno en cada tamaño de pantalla.',
    triggerSuccess: 'Mostrar éxito',
    triggerError: 'Mostrar error',
    triggerInfo: 'Mostrar información',
    checkboxLabel: 'Aceptar términos',
  },
  en: {
    inputs: 'Text fields',
    textareas: 'Text areas',
    selects: 'Selects',
    fieldWrapper: 'Field (label + hint/error)',
    checkboxes: 'Checkboxes',
    buttons: 'Buttons',
    floating: 'Floating buttons',
    cards: 'Cards',
    toasts: 'Toasts',
    default: 'Default',
    disabled: 'Disabled',
    invalid: 'Invalid',
    loading: 'Loading',
    withHint: 'With hint',
    withError: 'With error',
    hintText: 'This field is optional.',
    errorText: 'This field is required.',
    placeholder: 'Type here…',
    cardTitle: 'Card title',
    cardDescription: 'A short description under the title.',
    cardBody: 'The card body lives here, with the same inner spacing at every screen size.',
    triggerSuccess: 'Show success',
    triggerError: 'Show error',
    triggerInfo: 'Show info',
    checkboxLabel: 'Accept terms',
  },
} as const;

export interface UiReferenceIslandProps {
  lang: 'es' | 'en';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4" data-testid={`ui-ref-section-${title}`}>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

function Swatch({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-64 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default function UiReferenceIsland({ lang }: UiReferenceIslandProps) {
  const t = lang === 'en' ? COPY.en : COPY.es;
  const [checked, setChecked] = useState(false);
  const fieldId = useId();

  return (
    <div className="flex flex-col gap-10" data-testid="ui-reference">
      <Section title={t.inputs}>
        <Swatch label={t.default}>
          <Input placeholder={t.placeholder} data-testid="ui-ref-input-default" />
        </Swatch>
        <Swatch label={t.disabled}>
          <Input placeholder={t.placeholder} disabled data-testid="ui-ref-input-disabled" />
        </Swatch>
        <Swatch label={t.invalid}>
          <Input placeholder={t.placeholder} aria-invalid data-testid="ui-ref-input-invalid" />
        </Swatch>
      </Section>

      <Section title={t.textareas}>
        <Swatch label={t.default}>
          <Textarea placeholder={t.placeholder} data-testid="ui-ref-textarea-default" />
        </Swatch>
        <Swatch label="Auto-grow">
          <Textarea placeholder={t.placeholder} autoGrow data-testid="ui-ref-textarea-autogrow" />
        </Swatch>
      </Section>

      <Section title={t.selects}>
        <Swatch label={t.default}>
          <Select data-testid="ui-ref-select-default" defaultValue="a">
            <option value="a">Opción A</option>
            <option value="b">Opción B</option>
          </Select>
        </Swatch>
        <Swatch label={t.disabled}>
          <Select data-testid="ui-ref-select-disabled" disabled defaultValue="a">
            <option value="a">Opción A</option>
          </Select>
        </Swatch>
      </Section>

      <Section title={t.fieldWrapper}>
        <Swatch label={t.withHint}>
          <Field label={t.inputs} hint={t.hintText}>
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} placeholder={t.placeholder} />}
          </Field>
        </Swatch>
        <Swatch label={t.withError}>
          <Field label={t.inputs} error={t.errorText}>
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} aria-invalid placeholder={t.placeholder} />
            )}
          </Field>
        </Swatch>
      </Section>

      <Section title={t.checkboxes}>
        <label className="flex items-center gap-2 text-sm text-foreground" htmlFor={fieldId}>
          <Checkbox id={fieldId} checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
          {t.checkboxLabel}
        </label>
      </Section>

      <Section title={t.buttons}>
        {(['default', 'primary', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const).map((variant) => (
          <Swatch key={variant} label={variant}>
            <Button variant={variant} data-testid={`ui-ref-button-${variant}`}>
              {variant}
            </Button>
          </Swatch>
        ))}
        <Swatch label={t.loading}>
          <Button loading data-testid="ui-ref-button-loading">
            {t.default}
          </Button>
        </Swatch>
        <Swatch label={t.disabled}>
          <Button disabled data-testid="ui-ref-button-disabled">
            {t.default}
          </Button>
        </Swatch>
        {(['icon-xs', 'icon-sm', 'icon', 'icon-lg'] as const).map((size) => (
          <Swatch key={size} label={size}>
            <Button size={size} variant="secondary" aria-label={size}>
              <Badge variant="outline">{size.replace('icon', '').replace('-', '') || 'md'}</Badge>
            </Button>
          </Swatch>
        ))}
      </Section>

      <Section title={t.floating}>
        <Swatch label="BackButton / ScrollToTop">
          <div className="glass-floating flex h-10 w-10 items-center justify-center rounded-(--radius-pill) text-accent ring-1 ring-white/10 shadow-(--shadow-floating)">
            ←
          </div>
        </Swatch>
      </Section>

      <Section title={t.cards}>
        <Card className="w-80" data-testid="ui-ref-card">
          <CardHeader>
            <CardTitle>{t.cardTitle}</CardTitle>
            <CardDescription>{t.cardDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t.cardBody}</p>
          </CardContent>
          <CardFooter>
            <Button size="sm">{t.default}</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title={t.toasts}>
        <Button variant="secondary" onClick={() => toast.success(t.triggerSuccess)} data-testid="ui-ref-toast-success">
          {t.triggerSuccess}
        </Button>
        <Button variant="secondary" onClick={() => toast.error(t.triggerError)} data-testid="ui-ref-toast-error">
          {t.triggerError}
        </Button>
        <Button variant="secondary" onClick={() => toast(t.triggerInfo)} data-testid="ui-ref-toast-info">
          {t.triggerInfo}
        </Button>
      </Section>
    </div>
  );
}
