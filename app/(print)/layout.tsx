/**
 * Print layout.
 *
 * Deliberately free of application chrome: this route group exists so that a
 * document meant for a PDF renders as a document, not as a screen with the
 * navigation hidden.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>
}
