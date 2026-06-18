"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-3 z-40 mx-4 mt-4">
      <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between bg-surface/70 backdrop-blur-xl border border-border/60 rounded-2xl">
        <span className="font-display font-semibold text-base tracking-tight text-text">
          Lexis
        </span>
        <div className="flex gap-1">
          <NavLink href="/vocab" active={pathname.startsWith("/vocab")}>
            Vocab
          </NavLink>
          <NavLink href="/invest" active={pathname.startsWith("/invest")}>
            Invest
          </NavLink>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
        active
          ? "bg-accent/10 text-accent font-medium"
          : "text-muted hover:text-text hover:bg-panel"
      }`}
    >
      {children}
    </Link>
  );
}
