'use client';

import { use } from 'react';
import PageEditor from '@/components/notebook/PageEditor';

export default function PageEditorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: notebookId, pageId } = use(params);

  return <PageEditor notebookId={notebookId} pageId={pageId} />;
}
