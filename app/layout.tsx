import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harshit Studio",
  description: "A minimal local-first browser studio for GLB and GLTF assets.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
