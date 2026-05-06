'use client';

import HomeHeader from '@/components/layout/HomeHeader';
import CommunityHub from '@/components/home/CommunityHub';
import CommunitySidebar from '@/components/home/CommunitySidebar';

export default function HomePage() {
  return (
    <>
      <HomeHeader />
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          width: '100%',
          padding: '24px 20px',
          display: 'flex',
          gap: 24,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Main content area */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <CommunityHub />
        </div>

        {/* Right sidebar */}
        <div
          className="community-right-col"
          style={{
            width: 300,
            flexShrink: 0,
          }}
        >
          <CommunitySidebar />
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .community-right-col {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
