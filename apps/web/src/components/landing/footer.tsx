export function Footer() {
  return (
    <footer className="border-t border-line bg-ink py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row sm:px-10">
        <span className="font-display text-sm font-bold tracking-tight text-text">Rehearse</span>
        <p className="text-xs text-muted">Practice interviews out loud. Built as a portfolio project.</p>
        <a
          href="https://github.com/AsjalAbdullahButt/Rehearse"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Rehearse on GitHub"
          className="text-muted transition-colors hover:text-text"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true">
            <path d="M12 2a10 10 0 00-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.26-.45-1.29.1-2.68 0 0 .84-.27 2.75 1.03a9.4 9.4 0 015 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.39.2 2.42.1 2.68.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .26.18.58.69.48A10 10 0 0012 2z" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
