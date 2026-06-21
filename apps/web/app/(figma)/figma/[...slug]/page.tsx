import { notFound } from 'next/navigation';
import { getScreen } from '@/figma/registry';
import { FigmaScreenView } from '@/figma/kit';

/**
 * Single dynamic route for all 73 screens. `slug` (which may contain '/', e.g.
 * `onboarding/01-welcome`) resolves to a registry entry; the client stage renders
 * it responsively with phone/desktop comparison frames. Avoids 73 hand-written
 * route files.
 */
export default async function FigmaScreenRoute({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const path = slug.join('/');
  if (!getScreen(path)) notFound();
  return <FigmaScreenView slug={path} />;
}
