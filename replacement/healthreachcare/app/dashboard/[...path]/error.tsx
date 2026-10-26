'use client';

import Link from 'next/link';

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="dashboard-error-page">
      <section className="dashboard-error-card" role="alert">
        <span className="dashboard-error-mark" aria-hidden="true">!</span>
        <h1>We couldn’t open your dashboard</h1>
        <p>Your account is still signed in. Try loading the dashboard again, or return to sign in if the problem continues.</p>
        <div className="dashboard-error-actions">
          <button type="button" onClick={reset}>Try again</button>
          <Link href="/login">Return to sign in</Link>
        </div>
        <p className="dashboard-error-support">Need help? <a href="mailto:support@healthreachcare.co.za">support@healthreachcare.co.za</a></p>
      </section>
    </main>
  );
}
