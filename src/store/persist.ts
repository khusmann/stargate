/** Persistence and sharing. A show is text, so both are just encodings of text:
 *  localStorage so a reload never loses work, and the URL fragment so a link is
 *  a runnable show. No accounts, no server, nothing uploaded. */

import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { EXAMPLES } from "../examples";

const STORAGE_KEY = "stargate:script";
/** A whole show, compressed into the URL. */
const FRAGMENT_KEY = "s";
/** Just the id of a bundled example. */
const EXAMPLE_KEY = "e";

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

export interface LoadedShow {
  source: string;
  /**
   * True when the code itself came out of the URL, and so from whoever sent it.
   * A `#e=` link carries only the id of a show already in this bundle, which is
   * code we shipped — there is nothing for a stranger to smuggle in, so it does
   * not need approving and it fits in a tweet.
   */
  fromLink: boolean;
}

function readHash(hash: string = location.hash): LoadedShow | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));

  const id = params.get(EXAMPLE_KEY);
  if (id !== null) {
    const example = EXAMPLES.find((candidate) => candidate.id === id);
    // An unknown id is a stale link, not an attack: open normally.
    return example ? { source: example.source, fromLink: false } : null;
  }

  const encoded = params.get(FRAGMENT_KEY);
  if (encoded === null) return null;
  const decoded = decodeScript(encoded);
  return decoded === null ? null : { source: decoded, fromLink: true };
}

/** The fragment for a show: its example id when it is one untouched, and the
 *  whole compressed script when it is not. */
export function shareFragment(source: string): string {
  const params = new URLSearchParams();
  const example = EXAMPLES.find((candidate) => candidate.source === source);
  if (example) params.set(EXAMPLE_KEY, example.id);
  else params.set(FRAGMENT_KEY, encodeScript(source));
  return `#${params}`;
}

/** The last fragment this app wrote, so an incoming one can be told apart from
 *  the echo of our own autosave. */
let lastWritten: string | null = null;

/** Rewrite the fragment in place — never a history entry per keystroke. */
export function writeFragment(source: string): void {
  lastWritten = shareFragment(source);
  history.replaceState(null, "", `${location.pathname}${location.search}${lastWritten}`);
}

/**
 * A show that appeared in the address bar of an already-open tab — someone
 * pasting a share link rather than following one. Changing only the fragment is
 * a same-document navigation, so nothing reloads and the app has to notice for
 * itself. Returns null for the echo of our own autosave.
 */
export function incomingShow(): LoadedShow | null {
  if (location.hash === lastWritten) return null;
  return readHash();
}

export function shareUrl(source: string): string {
  return `${location.origin}${location.pathname}${location.search}${shareFragment(source)}`;
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

/** The escape hatch. A show with an endless loop in `pixel` freezes the tab,
 *  and because the script is restored from storage, reopening freezes it again
 *  — so there has to be a URL that starts clean without running anything. */
const RESET_HASHES = new Set(["#new", "#reset"]);

export function initialState(fallback: string): LoadedShow {
  if (RESET_HASHES.has(location.hash)) {
    clearSaved();
    clearFragment();
    return { source: fallback, fromLink: false };
  }
  return readHash() ?? { source: loadSaved() ?? fallback, fromLink: false };
}
