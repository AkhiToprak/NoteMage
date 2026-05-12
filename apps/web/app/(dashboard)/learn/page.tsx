import { redirect } from 'next/navigation';

// Phase 9.3 — /learn is the Learn Hub. The default landing tab is Paths.
// This is a server component so it can call `redirect()` at request time.
export default function Page() {
  redirect('/learn/paths');
}
