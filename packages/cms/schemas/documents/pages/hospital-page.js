export default {
  title: 'Ziekenhuis opnames',
  name: 'hospitalPage',
  type: 'document',
  fields: [
    {
      title: 'Uitgelichte artikelen',
      name: 'articles',
      type: 'array',
      of: [{ type: 'reference', to: { type: 'article' } }],
      validation: (Rule) => Rule.required().unique().max(1),
    },
  ],
};