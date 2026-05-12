import { permanentRedirect } from 'next/navigation';

type Params = { params: Promise<{ id: string; chatId: string }> };

export default async function Page({ params }: Params) {
  const { chatId } = await params;
  permanentRedirect(`/learn/chats/${chatId}`);
}
