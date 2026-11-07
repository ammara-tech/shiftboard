/*
  Invite links. Each team has one invite code, e.g. /join?code=K7QXM2PA9WRT.
  Knowing the code is what lets someone join: the codes can't be listed or guessed
  (12 characters from 31 → about 10^18 possibilities), and a member can make a new link,
  which stops the old one working.
  Letters that look alike (0/O, 1/I/L) are left out, so a code can be read out loud.
*/

export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 12;

/** A new random code. `random` is only passed in by the tests. */
export function makeInviteCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(CODE_LENGTH * 2);
  let code = "";
  // Throw away values that would make some letters more likely than others
  const limit = 256 - (256 % ALPHABET.length);
  for (const b of bytes) {
    if (b >= limit) continue;
    code += ALPHABET[b % ALPHABET.length];
    if (code.length === CODE_LENGTH) return code;
  }
  return code.length === CODE_LENGTH ? code : makeInviteCode(random);
}

export function isInviteCode(code: string) {
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c));
}

export function inviteLink(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/join?code=${code}`;
}

/** Accepts a pasted link or just the code (any capitals, spaces or dashes). Returns the code, or null. */
export function codeFromInput(input: string): string | null {
  const trimmed = input.trim();
  const fromLink = trimmed.match(/[?&]code=([A-Za-z0-9-]+)/);
  const code = (fromLink ? fromLink[1] : trimmed).replace(/[\s-]/g, "").toUpperCase();
  return isInviteCode(code) ? code : null;
}

/** The WhatsApp message for sharing an invite */
export function inviteMessage(teamName: string, link: string) {
  return `Join "${teamName}" on ShiftBoard to see your shifts and the team rota: ${link}`;
}
