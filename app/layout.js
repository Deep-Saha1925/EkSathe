import './globals.css';

export const metadata = {
  title: 'EkSathe — Ride Together. Never Lose Your Squad.',
  description: 'Live GPS map for friends travelling together. Built for Durga Puja pandal hopping.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b1020',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
