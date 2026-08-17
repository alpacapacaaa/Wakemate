/**
 * Invite codes travel two ways: read aloud as six characters, or tapped as a link. Both land in
 * the same place, so the join screen accepts either and this module is the one place that knows
 * how to tell them apart.
 */

/** Codes people read aloud and type — no 0/O/1/I (see store.inviteCode). */
const CODE = /[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}/;

export function buildInviteLink(code: string): string {
  return `voicealarm://join/${code.toUpperCase()}`;
}

/**
 * Pulls a code out of whatever was typed or pasted — a bare code, a `voicealarm://join/X` link, or
 * a whole invite message with the link buried in it. Returns null when there is no code in there.
 */
export function parseInviteCode(input: string): string | null {
  const upper = input.trim().toUpperCase();
  const fromLink = upper.match(/JOIN\/([A-Z0-9]{6})/);
  if (fromLink) return fromLink[1];
  const bare = upper.match(CODE);
  return bare ? bare[0] : null;
}

export function inviteMessage(roomName: string, code: string): string {
  return `Join "${roomName}" on Voice Alarm — code ${code.toUpperCase()}\n${buildInviteLink(code)}`;
}
