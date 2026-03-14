import type { Metadata } from 'next'
import { DM_Sans, DM_Mono } from 'next/font/google'
import localFont from 'next/font/local'
import { AuthProvider } from '@/context/auth-context'
import { ThemeProvider } from '@/context/theme-context'
import './globals.css'

const sansation = localFont({
  src: [
    { path: '../public/fonts/Sansation-Regular.ttf', weight: '400', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const dmMono = DM_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Plaz4 IP',
  description: 'Manage your patent portfolio, families, and deadlines',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${sansation.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <head>
        {/* Prevent flash of wrong theme on load */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('p4-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)})()` }} />
      </head>
      <body className="font-body bg-patent-navy text-white antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
