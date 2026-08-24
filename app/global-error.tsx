'use client'

/**
 * Root error boundary.
 *
 * Renders its own document because it replaces the root layout, so it cannot
 * rely on the application stylesheet being present.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8f8f6',
          color: '#14161a',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, background: '#fff', border: '1px solid #e3e2dd' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#a32218' }}>
            The application could not start
          </p>
          <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, color: '#4a5058' }}>
            An unrecoverable error occurred. Reload the page; if it persists, the reference below will
            appear in the server log.
          </p>
          {error.digest ? (
            <p style={{ marginTop: 12, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#767c85' }}>
              Reference: {error.digest}
            </p>
          ) : null}
          {/* A button rather than a link: this boundary replaces the root
              layout, so the router may not be available to navigate with. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
              color: '#fff', background: '#1f4e79', border: 'none',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
