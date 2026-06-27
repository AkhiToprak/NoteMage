import { redirect } from 'next/navigation';

/* The settings hub is now /profile — each setting opens its own dedicated page
   (/settings/account, /settings/appearance, …) with a breadcrumb back to the
   profile. /settings itself is kept only so old links/bookmarks resolve; it
   lands on the Account page. */
export default function SettingsIndexPage() {
  redirect('/settings/account');
}
