"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Avatar from "@/components/Avatar";
import Icon, { type IconName } from "@/components/Icon";
import Logo from "@/components/Logo";
import SyncBadge from "@/components/SyncBadge";
import ThemeToggle from "@/components/ThemeToggle";
import { needsManager, shiftsUpForGrabs } from "@/lib/requests";
import { todayIso } from "@/lib/rota";
import { isManager } from "@/lib/team";
import { useApp } from "@/lib/store";

/*
  The bar at the top: logo, which team you're in, whether it's live, the theme and you.
  Under it, the four pages. Requests shows a number when something is waiting for you:
  for a manager, requests to approve; for staff, shifts they could take.
*/
const PAGES: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Rota", icon: "calendar" },
  { href: "/requests", label: "Requests", icon: "inbox" },
  { href: "/hours", label: "Hours", icon: "clock" },
  { href: "/team", label: "Team", icon: "people" },
];

export default function Header() {
  const { team, profile, uid, requests, shifts } = useApp();
  const path = usePathname();
  const waiting = team && uid ? (isManager(team, uid) ? needsManager(requests).length : shiftsUpForGrabs(requests, shifts, uid, todayIso()).length) : 0;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight" aria-label="ShiftBoard: back to the rota">
          <Logo />
          <span className="hidden min-[420px]:inline">ShiftBoard</span>
        </Link>
        {team && (
          <Link
            href="/team"
            className="min-w-0 truncate rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold hover:border-marker"
            title="Team: people, invite link and settings"
          >
            {team.name}
          </Link>
        )}
        <div className="ml-auto flex items-center gap-1">
          <SyncBadge />
          <ThemeToggle />
          {uid && (
            <Link href="/team" className="tool" aria-label="You and your team">
              <Avatar uid={uid} name={profile.name || "Me"} />
            </Link>
          )}
        </div>
      </div>
      <nav aria-label="Pages" className="mx-auto max-w-5xl px-2">
        <ul className="flex">
          {PAGES.map((p) => {
            const current = p.href === "/" ? path === "/" : path.startsWith(p.href);
            return (
              <li key={p.href} className="flex-1 sm:flex-none">
                <Link
                  href={p.href}
                  aria-current={current ? "page" : undefined}
                  className={`flex items-center justify-center gap-1.5 border-b-[3px] px-3 py-2.5 text-sm font-bold sm:px-4 ${
                    current ? "border-marker text-marker" : "border-transparent text-ink-soft hover:text-ink"
                  }`}
                >
                  <Icon name={p.icon} className="h-4 w-4" />
                  {p.label}
                  {p.href === "/requests" && waiting > 0 && (
                    <span className="rounded-full bg-amber px-1.5 text-xs font-bold text-white dark:text-[#0f1524]">
                      {waiting}
                      <span className="sr-only"> waiting</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
