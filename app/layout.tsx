import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassActionDaily — Consumer Class Actions Filed in U.S. Federal Courts",
  description: "Track every consumer class action filed in U.S. federal courts. Updated daily from CourtListener.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="top-strip">
            <strong>Attorney Advertising.</strong> Information on this site does not create an attorney-client relationship. Prior results do not guarantee outcomes.
          </div>
          <div className="header-inner">
            <Link href="/" className="logo">Class<span>Action</span>Daily</Link>
            <nav className="main-nav">
              <Link href="/">Latest Cases</Link>
              <Link href="/investigations">Investigations</Link>
              <Link href="/categories">Categories</Link>
              <Link href="/defendants">Defendants</Link>
              <Link href="/about">About</Link>
            </nav>
          </div>
        </header>

        {children}

        <footer className="site-footer">
          <div className="footer-inner">
            <div>
              <div className="brand">Class<span>Action</span>Daily</div>
              <p style={{ fontSize: 13, color: "#8b96a3", marginTop: 8 }}>
                Tracking new consumer class actions filed in U.S. federal courts. Updated daily.
              </p>
            </div>
            <div>
              <h5>Sections</h5>
              <Link href="/">Latest cases</Link>
              <Link href="/investigations">Investigations</Link>
              <Link href="/categories">Categories</Link>
              <Link href="/defendants">Defendants</Link>
            </div>
            <div>
              <h5>About</h5>
              <Link href="/about">How it works</Link>
            </div>
            <div>
              <h5>Get updates</h5>
              <a>Daily email digest</a>
            </div>
          </div>
          <div className="legal-disclaimer">
            <strong>Attorney advertising.</strong> The content on this site is for general informational purposes only and does not constitute legal advice. No attorney-client relationship is formed by use of this site or submission of any form. Prior results do not guarantee a similar outcome. ClassActionDaily is not a law firm or a lawyer referral service. Case summaries are generated automatically and may contain errors; consult the original docket entry on CourtListener for authoritative information. © 2026 ClassActionDaily.
          </div>
        </footer>
      </body>
    </html>
  );
}