import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemas';

export default defineConfig({
  name: 'chuyocode-studio',
  title: 'ChuyoCode Studio',
  projectId: 'z9wkqssq',
  dataset: 'production_',
  plugins: [structureTool(), visionTool()],
  schema: {
    types: schemaTypes,
  },
});
