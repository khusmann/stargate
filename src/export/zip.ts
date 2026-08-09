/** A streaming zip writer.
 *
 *  Peak memory has to be flat in show length, not linear: an 18,000-frame show
 *  is ~70 MB of PNG. So entries are stored (never re-deflated — PNG is already
 *  compressed) and output chunks are folded into Blob parts as they arrive.
 *  Blob backing spills to disk; one giant ArrayBuffer does not.
 */

import { Zip, ZipPassThrough } from "fflate";

/** Fold buffered chunks into a Blob part once they exceed this. */
const FLUSH_BYTES = 4 << 20;

export class ZipStream {
  private readonly zip: Zip;
  private readonly parts: BlobPart[] = [];
  private pending: Uint8Array<ArrayBuffer>[] = [];
  private pendingBytes = 0;
  private failure: Error | null = null;
  private done!: (blob: Blob) => void;
  private readonly finished: Promise<Blob>;

  constructor() {
    this.finished = new Promise<Blob>((resolve) => {
      this.done = resolve;
    });
    this.zip = new Zip((err, chunk, final) => {
      if (err) {
        this.failure = err;
        return;
      }
      if (chunk.length > 0) {
        this.pending.push(chunk as Uint8Array<ArrayBuffer>);
        this.pendingBytes += chunk.length;
        if (this.pendingBytes >= FLUSH_BYTES) this.flush();
      }
      if (final) {
        this.flush();
        this.done(new Blob(this.parts, { type: "application/zip" }));
      }
    });
  }

  private flush(): void {
    if (this.pending.length === 0) return;
    this.parts.push(new Blob(this.pending));
    this.pending = [];
    this.pendingBytes = 0;
  }

  /** Add one stored (uncompressed) entry. */
  add(path: string, data: Uint8Array, modified = new Date()): void {
    if (this.failure) throw this.failure;
    const entry = new ZipPassThrough(path);
    entry.mtime = modified;
    this.zip.add(entry);
    entry.push(data, true);
  }

  /** Close the archive and resolve with the finished Blob. */
  async close(): Promise<Blob> {
    if (this.failure) throw this.failure;
    this.zip.end();
    const blob = await this.finished;
    if (this.failure) throw this.failure;
    return blob;
  }

  /** Abandon the archive; nothing further may be added. */
  abort(): void {
    try {
      this.zip.terminate();
    } catch {
      // Already ended — nothing to tear down.
    }
    this.parts.length = 0;
    this.pending = [];
    this.pendingBytes = 0;
  }
}
