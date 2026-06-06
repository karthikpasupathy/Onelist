import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    documents: i.entity({
      userId: i.string().indexed(),
      docKey: i.string().unique().indexed().optional(),
      year: i.number().indexed().optional(),
      content: i.string(),
      createdAt: i.number(),
      updatedAt: i.number(),
    }),
    snapshots: i.entity({
      userId: i.string().indexed(),
      year: i.number().indexed().optional(),
      content: i.string(),
      createdAt: i.number(),
      pinned: i.boolean().optional(),
    }),
    snippets: i.entity({
      userId: i.string().indexed(),
      name: i.string().indexed(),
      content: i.string(),
      createdAt: i.number(),
      updatedAt: i.number(),
    }),
    settings: i.entity({
      userId: i.string().unique().indexed(),
    }),
  },
});

type _AppSchema = typeof _schema;
export interface AppSchema extends _AppSchema {}

const schema: AppSchema = _schema;

export default schema;
