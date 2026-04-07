'use client';

import { useParams } from 'next/navigation';
import GroupDetailView from '@/components/groups/GroupDetailView';

export default function GroupDetailPage() {
  const params = useParams();
  const groupId = params.id as string;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <GroupDetailView groupId={groupId} />
    </div>
  );
}
