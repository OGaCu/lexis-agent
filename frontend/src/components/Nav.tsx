import Link from "next/link";

export default function Nav() {
  return (
    <nav className="border-b border-border bg-surface">
      <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
        <span className="font-semibold tracking-tight text-text">Lexis</span>
        <div className="flex gap-6 text-sm">
          <Link href="/vocab" className="text-muted hover:text-accent transition-colors">
            Vocab
          </Link>
          <Link href="/invest" className="text-muted hover:text-accent transition-colors">
            Invest
          </Link>
        </div>
      </div>
    </nav>
  );
}
