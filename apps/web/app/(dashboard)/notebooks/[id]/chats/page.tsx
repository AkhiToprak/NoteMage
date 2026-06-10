import { permanentRedirect } from 'next/navigation';

type Params = { params: Promise<{ id: string }> };

export default async function Page({ params }: Params) {
  await params;
  permanentRedirect('/learn/chats');
}
