// Schema: News
// Sanity document type for news articles in the ChuyoCode platform.
// All text fields are localized (es/en) with es as the fallback.
export default {
  name: 'news',
  type: 'document',
  title: 'Noticia',
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
      name: 'excerpt',
      type: 'object',
      title: 'Extracto',
      fields: [
        { name: 'es', type: 'text', title: 'Español', rows: 2 },
        { name: 'en', type: 'text', title: 'English', rows: 2 },
      ],
    },
    {
      name: 'body',
      type: 'object',
      title: 'Contenido',
      fields: [
        { name: 'es', type: 'array', of: [{ type: 'block' }], title: 'Español' },
        { name: 'en', type: 'array', of: [{ type: 'block' }], title: 'English' },
      ],
    },
    {
      name: 'publishedAt',
      type: 'datetime',
      title: 'Fecha de publicación',
      initialValue: () => new Date().toISOString(),
    },
    {
      name: 'image',
      type: 'image',
      title: 'Imagen',
      options: { hotspot: true },
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
    // `image` above keeps its role as the card/poster thumbnail everywhere else.
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
        'Imagen panorámica de fondo para el carrusel destacado de la home. Si no se define, se usa la imagen del artículo. Opcional.',
      options: { hotspot: true },
    },
  ],
  orderings: [
    { title: 'Fecha, nuevo primero', name: 'publishedAtDesc', by: [{ field: 'publishedAt', direction: 'desc' }] },
  ],
  preview: {
    select: { title: 'title.es', subtitle: 'publishedAt', media: 'image' },
  },
};
