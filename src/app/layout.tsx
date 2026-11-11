import type { Metadata } from "next";
import { Suspense } from "react";
import { Cascaron } from "@/componentes/Cascaron";
import "./globals.css";

export const metadata: Metadata = {
  title: "Procesador de facturas",
  description: "Lectura automática de facturas con OCR",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <Cascaron />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
