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
  ],
  orderings: [
    { title: 'Fecha, nuevo primero', name: 'publishedAtDesc', by: [{ field: 'publishedAt', direction: 'desc' }] },
  ],
  preview: {
    select: { title: 'title.es', subtitle: 'publishedAt', media: 'image' },
  },
};
