// Schema: Book
// Sanity document type for books in the ChuyoCode catalog.
// All text fields are localized (es/en) with es as the fallback.
export default {
  name: 'book',
  type: 'document',
  title: 'Libro',
  fields: [
    {
      name: 'title',
      type: 'object',
      title: 'Título',
      fields: [
        { name: 'es', type: 'string', title: 'Español' },
        { name: 'en', type: 'string', title: 'English' },
      ],
    },
    {
      name: 'slug',
      type: 'slug',
      title: 'Slug',
      options: { source: 'title.es', maxLength: 96 },
    },
    {
      name: 'author',
      type: 'object',
      title: 'Autor',
      fields: [
        { name: 'es', type: 'string', title: 'Español' },
        { name: 'en', type: 'string', title: 'English' },
      ],
    },
    {
      name: 'description',
      type: 'object',
      title: 'Descripción',
      fields: [
        { name: 'es', type: 'text', title: 'Español' },
        { name: 'en', type: 'text', title: 'English' },
      ],
    },
    {
      name: 'cover',
      type: 'image',
      title: 'Portada',
      options: { hotspot: true },
    },
    {
      name: 'pdf',
      type: 'file',
      title: 'PDF (opcional)',
      options: { accept: '.pdf' },
    },
    // frontend-v3 (content-schema delta): additive OPTIONAL discovery fields.
    // All are optional so existing documents without them keep rendering; GROQ
    // applies coalesce() safe defaults (featured->false, tagline->"").
    {
      name: 'featured',
      type: 'boolean',
      title: 'Destacado',
      description: 'Incluir en el carrusel destacado de la home.',
      initialValue: false,
    },
    {
      name: 'tagline',
      type: 'object',
      title: 'Lema',
      description: 'Frase editorial corta para hero/spotlight (opcional).',
      fields: [
        { name: 'es', type: 'string', title: 'Español' },
        { name: 'en', type: 'string', title: 'English' },
      ],
    },
    {
      name: 'themeTag',
      type: 'string',
      title: 'Tema',
      description: 'Agrupa el contenido en filas editoriales (opcional).',
      options: {
        list: [
          { title: 'Arquitectura', value: 'architecture' },
          { title: 'Testing', value: 'testing' },
          { title: 'Frontend', value: 'frontend' },
          { title: 'Backend', value: 'backend' },
          { title: 'Carrera', value: 'career' },
        ],
      },
    },
    // hero-logo-background (content-schema delta): additive OPTIONAL hero art.
    // Also optional, same rule as the block above — documents without them keep
    // rendering unchanged. These surface ONLY in the home HeroCarousel slide;
    // `cover` above keeps its role as the card/poster thumbnail everywhere else.
    {
      name: 'contentLogo',
      type: 'image',
      title: 'Logo del contenido',
      description:
        'PNG con fondo transparente (logotipo del título). Se muestra sobre el título en el carrusel destacado de la home. Opcional.',
      options: { hotspot: true },
    },
    {
      name: 'heroBackground',
      type: 'image',
      title: 'Fondo del hero',
      description:
        'Imagen panorámica de fondo para el carrusel destacado de la home. Si no se define, se usa la portada. Opcional.',
      options: { hotspot: true },
    },
  ],
  preview: {
    select: { title: 'title.es', media: 'cover' },
  },
};
