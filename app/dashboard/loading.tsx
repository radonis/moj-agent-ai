export default function DashboardLoading() {
  return (
    <main className="page app-page dashboard-page">
      <aside className="app-nav app-nav-loading" aria-hidden="true" />
      <section className="dashboard-shell">
        <header className="dashboard-hero dashboard-skeleton-block">
          <div className="dashboard-skeleton-line dashboard-skeleton-line-wide" />
          <div className="dashboard-skeleton-line dashboard-skeleton-line-medium" />
        </header>

        <div className="dashboard-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={index} className="dashboard-card dashboard-skeleton-card">
              <div className="dashboard-skeleton-line dashboard-skeleton-line-short" />
              <div className="dashboard-skeleton-line dashboard-skeleton-line-wide" />
              <div className="dashboard-skeleton-line dashboard-skeleton-line-medium" />
              <div className="dashboard-skeleton-line dashboard-skeleton-line-short" />
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
