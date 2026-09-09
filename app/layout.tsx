import './globals.css';
import PwaRegister from './PwaRegister';

export const metadata = {
  title: 'MaterialDepot CRM',
  description: 'CRM application for MaterialDepot',
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },

  appleWebApp: {
    capable: true,
    title: 'MD CRM',
    statusBarStyle: 'black-translucent' as const,
  },
};

export const viewport = {
  themeColor: '#1F3A5F',
  width: 'device-width',
  initialScale: 1,

  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
