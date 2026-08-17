/**
 * "HH:MM", 24h, **device-local wall clock** — 07:00 means 07:00 wherever the phone is, never a UTC
 * instant (`docs/api-contract.md` §3). Never trusted at the native boundary whatever its source.
 */
export type ParsedTime = { hour: number; minute: number };

export const DEFAULT_TIME = '07:00';

/**
 * Parses "HH:MM" into hour/minute, returning null for anything malformed.
 *
 * This must be used before handing a time to the AlarmKit module: passing NaN into the native
 * `Int?` field trips an assertion inside ExpoModulesCore's number cast and takes the whole app
 * down with SIGTRAP (observed with the Prism mock, whose Alarm schema has no example and so
 * returns `time: "string"`).
 */
export function parseAlarmTime(time: string | null | undefined): ParsedTime | null {
  if (!time) return null;
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(time);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** Same as parseAlarmTime but falls back to 07:00 so UI never renders an invalid state. */
export function parseAlarmTimeOrDefault(time: string | null | undefined): ParsedTime {
  return parseAlarmTime(time) ?? { hour: 7, minute: 0 };
}
