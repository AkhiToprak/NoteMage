'use client';

import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PageEditor from '@/components/notebook/PageEditor';
import dynamic from 'next/dynamic';

const InfiniteCanvas = dynamic(() => import('@/components/notebook/InfiniteCanvas'), { ssr: false });

export default function PageEditorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: notebookId, pageId } = use(params);
  const searchParams = useSearchParams();
  const highlightTerm = searchParams.get('highlight') || undefined;
  const [pageType, setPageType] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/notebooks/${notebookId}/pages/${pageId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.pageType) {
          setPageType(json.data.pageType);
        } else {
          setPageType('text');
        }
      })
      .catch(() => setPageType('text'));
  }, [notebookId, pageId]);

  if (!pageType) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'rgba(237,233,255,0.3)',
        fontFamily: 'inherit', fontSize: '14px',
      }}>
        Loading...
      </div>
    );
  }

  if (pageType === 'canvas') {
    return <InfiniteCanvas notebookId={notebookId} pageId={pageId} />;
  }

  return <PageEditor notebookId={notebookId} pageId={pageId} highlightTerm={highlightTerm} />;
}
