"use client";

import Icon from "@/components/Icon";
import { dismissToast, useApp } from "@/lib/store";

/* Live messages ("Your time off was approved") at the bottom of the screen. Screen readers announce them. */
export default function Toasts() {
  const { toasts } = useApp();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className="rise pointer-events-auto flex max-w-sm items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-page shadow-lg">
          <Icon name="check" className="h-4 w-4 text-amber" />
          <span>{t.text}</span>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Close" className="ml-1 opacity-70 hover:opacity-100">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
