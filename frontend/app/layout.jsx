import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "./components/Molecules/navbar";
import Footer from "./components/Molecules/Footer";
import { ThemeProvider } from "./components/Atoms/ThemeProvider";
import PrivyProviderWrapper from "./components/Atoms/PrivyProviderWrapper";
import SignerBinder from "./components/Atoms/SignerBinder";
import { AuthProvider } from "./components/Atoms/AuthProvider";
import { NotificationProvider } from "./components/Atoms/NotificationProvider";
import ChatNotifier from "./components/Atoms/ChatNotifier";
import RootToaster from "./components/Atoms/RootToaster";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "HybridAgent — Secure Commission Platform",
  description: "A hybrid platform for secure, automated commission payments on property and vehicle sales.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('theme');
                  var dark = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  document.documentElement.classList.add(dark ? 'dark' : 'light');
                  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
                } catch (e) {}
              })();
            `,
          }}
        />
        <ThemeProvider>
          <PrivyProviderWrapper>
            <AuthProvider>
              <NotificationProvider>
                <RootToaster />
                <ChatNotifier />
                <SignerBinder />
                <Navbar />
                {children}
                <Footer />
              </NotificationProvider>
            </AuthProvider>
          </PrivyProviderWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
