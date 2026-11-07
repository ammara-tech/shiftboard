"use client";

import { useState, type FormEvent } from "react";
import Icon from "@/components/Icon";
import { deleteNotice, markNoticeRead, postNotice } from "@/lib/actions";
import { MAX_NOTICE, readSummary, recentNotices } from "@/lib/notices";
import { isManager } from "@/lib/team";
import { useApp } from "@/lib/store";

/*
  The notice board at the top of the rota (lib/notices.ts).
  Managers post short notices and see who has read each one. Everyone else presses "Got it".
  Notices stay for 30 days.
*/

function when(ms: number, now: number) {
  const mins = Math.round((now - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export default function NoticeBoard() {
  const { team, uid, notices } = useApp();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [now] = useState(() => Date.now());
  if (!team || !uid) return null;
  const manager = isManager(team, uid);
  const shown = recentNotices(notices, now);
  if (shown.length === 0 && !manager) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    postNotice(text);
    setText("");
    setWriting(false);
  }

  return (
    <section aria-labelledby="notices-title" className="mb-6 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="notices-title" className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-ink-soft">
          <Icon name="megaphone" className="h-4 w-4 text-amber" />
          Notice board
        </h2>
        {manager && !writing && (
          <button type="button" onClick={() => setWriting(true)} className="btn-quiet px-3 py-1.5 text-sm">
            <Icon name="plus" className="h-4 w-4" />
            Post a notice
          </button>
        )}
      </div>

      {writing && (
        <form onSubmit={submit} className="mt-3">
          <label htmlFor="notice-text" className="text-sm font-semibold">
            Your notice to the team
          </label>
          <textarea
            id="notice-text"
            autoFocus
            rows={3}
            maxLength={MAX_NOTICE}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Stock take on Friday at 7. Please be on time!"
            className="field mt-1 resize-y"
          />
          <p className="mt-1 text-xs text-ink-soft">
            {text.length}/{MAX_NOTICE}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="submit" disabled={!text.trim()} className="btn px-4 py-2 text-sm">
              Post
            </button>
            <button type="button" onClick={() => setWriting(false)} className="btn-quiet px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {shown.length === 0 ? (
        !writing && <p className="mt-2 text-sm text-ink-soft">No notices. Post one when there&apos;s something the whole team should know.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {shown.map((n) => {
            const mine = n.by === uid;
            const read = n.readBy.includes(uid);
            const summary = readSummary(n, team);
            return (
              <li key={n.id} className={`rounded-xl border px-4 py-3 ${!mine && !read ? "border-amber/50 bg-amber-soft" : "border-line"}`}>
                <p className="whitespace-pre-line break-words">{n.text}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {mine ? "You" : team.members[n.by]?.name || "A manager"} · {when(n.createdAt, now)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  {!mine && !read && (
                    <button type="button" onClick={() => markNoticeRead(n)} className="btn px-3 py-1.5 text-sm">
                      <Icon name="check" className="h-4 w-4" />
                      Got it
                    </button>
                  )}
                  {!mine && read && <span className="font-semibold text-teal">You&apos;ve read this</span>}
                  {manager && (
                    <details className="text-ink-soft">
                      <summary className="cursor-pointer font-semibold">
                        Read by {summary.read.length} of {summary.read.length + summary.notRead.length}
                      </summary>
                      <p className="mt-1">{summary.read.length ? `Read: ${summary.read.join(", ")}` : "Nobody has read it yet."}</p>
                      {summary.notRead.length > 0 && <p>Not yet: {summary.notRead.join(", ")}</p>}
                    </details>
                  )}
                  {manager && (
                    <button type="button" onClick={() => deleteNotice(n)} className="ml-auto font-semibold text-alert hover:underline">
                      Delete<span className="sr-only"> this notice</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
