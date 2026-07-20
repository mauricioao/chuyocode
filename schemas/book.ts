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
  ],
  preview: {
    select: { title: 'title.es', media: 'cover' },
  },
};
