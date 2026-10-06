/**
 * Uploading a lesson video straight from a staff browser to Bunny (DEC-081).
 *
 * TUS, the resumable upload protocol Bunny's upload endpoint speaks, in about
 * a hundred lines rather than a dependency. The browser never sees the API
 * key: the server creates the video and hands back a signature that is valid
 * for that one video until it expires (`startBunnyUploadAction`).
 *
 * The file goes up in chunks. Each chunk is sent with XMLHttpRequest because
 * fetch cannot report upload progress, and a chunk that fails is retried after
 * asking Bunny how much it already has (HEAD), so a dropped connection resumes
 * rather than starting again. Client-only: no server imports.
 */

export type UploadTicket = {
  endpoint: string;
  libraryId: string;
  videoId: string;
  signature: string;
  expires: number;
};

const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_RETRIES = 4;

function base64(value: string): string {
  // TUS metadata values are base64 of UTF-8; titles can hold any character.
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function authHeaders(ticket: UploadTicket): Record<string, string> {
  return {
    AuthorizationSignature: ticket.signature,
    AuthorizationExpire: String(ticket.expires),
    VideoId: ticket.videoId,
    LibraryId: ticket.libraryId,
    "Tus-Resumable": "1.0.0",
  };
}

async function createUpload(ticket: UploadTicket, file: File): Promise<string> {
  const response = await fetch(ticket.endpoint, {
    method: "POST",
    headers: {
      ...authHeaders(ticket),
      "Upload-Length": String(file.size),
      "Upload-Metadata": `filetype ${base64(file.type || "video/mp4")},title ${base64(file.name)}`,
    },
  });
  const location = response.headers.get("location");
  if (!response.ok || !location) {
    throw new Error(`Bunny would not start the upload (${response.status}).`);
  }
  return new URL(location, ticket.endpoint).toString();
}

async function currentOffset(ticket: UploadTicket, uploadUrl: string): Promise<number> {
  const response = await fetch(uploadUrl, { method: "HEAD", headers: authHeaders(ticket) });
  const offset = Number(response.headers.get("upload-offset"));
  if (!response.ok || !Number.isFinite(offset)) throw new Error("Could not resume the upload.");
  return offset;
}

function sendChunk(
  ticket: UploadTicket,
  uploadUrl: string,
  chunk: Blob,
  offset: number,
  onBytes: (sent: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PATCH", uploadUrl);
    for (const [name, value] of Object.entries(authHeaders(ticket))) xhr.setRequestHeader(name, value);
    xhr.setRequestHeader("Upload-Offset", String(offset));
    xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onBytes(event.loaded);
    };
    xhr.onload = () => {
      const next = Number(xhr.getResponseHeader("upload-offset"));
      if (xhr.status >= 200 && xhr.status < 300 && Number.isFinite(next)) resolve(next);
      else reject(new Error(`Upload chunk refused (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("The connection dropped during the upload."));
    xhr.onabort = () => reject(new DOMException("Upload canceled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(chunk);
  });
}

/**
 * Uploads `file` for the ticket's video. `onProgress` gets 0–1. Resolves when
 * Bunny has every byte; encoding then happens on Bunny's side.
 */
export async function uploadToBunny(
  ticket: UploadTicket,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const uploadUrl = await createUpload(ticket, file);
  let offset = 0;
  let retries = 0;
  onProgress(0);

  while (offset < file.size) {
    if (signal?.aborted) throw new DOMException("Upload canceled", "AbortError");
    const end = Math.min(offset + CHUNK_BYTES, file.size);
    try {
      const base = offset;
      offset = await sendChunk(
        ticket,
        uploadUrl,
        file.slice(offset, end),
        offset,
        (sent) => onProgress(Math.min(1, (base + sent) / file.size)),
        signal,
      );
      retries = 0;
      onProgress(offset / file.size);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      retries += 1;
      if (retries > MAX_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** retries));
      offset = await currentOffset(ticket, uploadUrl);
    }
  }
  onProgress(1);
}
