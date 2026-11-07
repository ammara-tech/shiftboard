import { colourFor, initials } from "@/lib/members";

/* A round badge with someone's initials, in their own colour */
export default function Avatar({ uid, name, size = "h-8 w-8 text-xs" }: { uid: string; name: string; size?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${size}`}
      style={{ background: colourFor(uid) }}
    >
      {initials(name)}
    </span>
  );
}
