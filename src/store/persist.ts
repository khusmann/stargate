/** Persistence and sharing. A show is text, so both are just encodings of text:
 *  localStorage so a reload never loses work, and the URL fragment so a link is
 *  a runnable show. No accounts, no server, nothing uploaded. */

import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";

const STORAGE_KEY = "stargate:script";
const FRAGMENT_KEY = "s";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  // Chunked: String.fromCharCode(...bytes) blows the argument limit on long shows.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeScript(source: string): string {
  return toBase64Url(deflateSync(strToU8(source), { level: 9 }));
}

export function decodeScript(encoded: string): string | null {
  try {
    return strFromU8(inflateSync(fromBase64Url(encoded)));
  } catch {
    return null;
  }
}

export function scriptFromFragment(hash: string = location.hash): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const encoded = params.get(FRAGMENT_KEY);
  return encoded ? decodeScript(encoded) : null;
}

/** The last fragment this app wrote, so an incoming one can be told apart from
 *  the echo of our own autosave. */
let lastWritten: string | null = null;

/** Rewrite the fragment in place — never a history entry per keystroke. */
export function writeFragment(source: string): void {
  const params = new URLSearchParams();
  params.set(FRAGMENT_KEY, encodeScript(source));
  lastWritten = `#${params}`;
  history.replaceState(null, "", `${location.pathname}${location.search}${lastWritten}`);
}

/**
 * A show that appeared in the address bar of an already-open tab — someone
 * pasting a share link rather than following one. Changing only the fragment is
 * a same-document navigation, so nothing reloads and the app has to notice for
 * itself. Returns null for the echo of our own autosave.
 */
export function incomingScript(): string | null {
  if (location.hash === lastWritten) return null;
  return scriptFromFragment();
}

export function shareUrl(source: string): string {
  const params = new URLSearchParams();
  params.set(FRAGMENT_KEY, encodeScript(source));
  return `${location.origin}${location.pathname}${location.search}#${params}`;
}

export function loadSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private mode, file:// with storage disabled — not fatal
  }
}

export function save(source: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, source);
  } catch {
    // Out of quota or storage blocked; the URL fragment still holds the show.
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing saved, nothing to clear.
  }
}

/** Strip the fragment without adding a history entry. */
export function clearFragment(): void {
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

export interface InitialState {
  source: string;
  /**
   * True when the source arrived in a link. A link is the one way somebody
   * else's code reaches this app, and a show is arbitrary JavaScript running in
   * this origin — so it is loaded into the editor to be read, and not run until
   * the person looking at it says so. Everything else here is code you typed or
   * pasted deliberately.
   */
  fromLink: boolean;
}

/** The escape hatch. A show with an endless loop in `pixel` freezes the tab,
 *  and because the script is restored from storage, reopening freezes it again
 *  — so there has to be a URL that starts clean without running anything. */
const RESET_HASHES = new Set(["#new", "#reset"]);

export function initialState(fallback: string): InitialState {
  if (RESET_HASHES.has(location.hash)) {
    clearSaved();
    clearFragment();
    return { source: fallback, fromLink: false };
  }
  const shared = scriptFromFragment();
  if (shared !== null) return { source: shared, fromLink: true };
  return { source: loadSaved() ?? fallback, fromLink: false };
}
