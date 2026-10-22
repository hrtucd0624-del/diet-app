"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "ホーム", icon: "🏠" },
  { href: "/record", label: "記録", icon: "✏️" },
  { href: "/graph", label: "グラフ", icon: "📈" },
  { href: "/settings", label: "設定", icon: "⚙️" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-10 border-t border-nasu-100 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs ${
                  active ? "font-bold text-nasu-600" : "text-nasu-400"
                }`}
              >
                <span className="text-xl" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
