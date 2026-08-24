import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'CareCapital Exchange — Healthcare capital, intelligently matched.',
    template: '%s · CareCapital Exchange',
  },
  description:
    'Transform your healthcare financing opportunity into an institutional-quality financing package and connect with lenders whose lending criteria fit your deal.',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f8f8f6',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
