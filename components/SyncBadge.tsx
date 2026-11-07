"use client";

import Icon from "@/components/Icon";
import { useApp } from "@/lib/store";

/*
  Shows whether your changes have reached everyone:
  - Offline: you can still see the rota; your changes are's saved on this phone and sent when you're back online
  - Syncing: sending your last change
  - Live: everything's up to date, and other people's changes arrive by themselves
*/
export default function SyncBadge() {
  const { online, pending } = useApp();
  const [label, icon, colour] = !online
    ? ["Offline", "cloudOff", "text-alert"]
    : pending
      ? ["Syncing", "cloud", "text-ink-soft"]
      : ["Live", "cloud", "text-marker"];
  return (
    <span role="status" title={!online ? "Offline: your changes are saved on this phone and sent when you're back online" : pending ? "Sending your changes" : "Up to date. Changes from others appear by themselves."} className={`inline-flex items-center gap-1.5 text-xs font-semibold ${colour}`}>
      {online && !pending ? <span aria-hidden="true" className="h-2 w-2 rounded-full bg-marker motion-safe:animate-pulse" /> : <Icon name={icon as "cloud"} className="h-4 w-4" />}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </span>
  );
}
