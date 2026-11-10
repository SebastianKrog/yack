import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Yack — Yet another checklist, kinda",
  description: "Yet another checklist, kinda. A personal checklist with notes and trophies.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
