// At most six 8 MiB ranges are buffered. Writes are serialized so concurrent
// workers never race the file stream's position. Nothing fetches until called.
export async function parallelDownload({ manifest, writable, signal, onProgress = () => {}, fetchImpl = fetch, concurrency = 6, chunkSize = 8 * 1024 * 1024 }) {
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  let next = 0;
  let completed = 0;
  let writes = Promise.resolve();
  let failure;

  async function worker() {
    while (next < manifest.size) {
      combined.throwIfAborted();
      const start = next;
      next += chunkSize;
      const end = Math.min(start + chunkSize, manifest.size) - 1;
      let data;
      for (let attempt = 0; attempt < 3; attempt++) {
        combined.throwIfAborted();
        try {
          const response = await fetchImpl(manifest.url, {
            headers: { Range: `bytes=${start}-${end}`, 'If-Match': manifest.etag },
            signal: AbortSignal.any([combined, AbortSignal.timeout(60000)]),
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
          });
          if (response.status !== 206 || response.headers.get('Content-Range') !== `bytes ${start}-${end}/${manifest.size}` || response.headers.get('ETag') !== manifest.etag) {
            await response.body?.cancel();
            const error = new Error(`Download response changed or was rejected (${response.status}). Please start again.`);
            error.permanent = true;
            throw error;
          }
          // Limit memory even if an origin sends more data than the requested range.
          data = new Uint8Array(end - start + 1);
          const reader = response.body.getReader();
          let offset = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (offset + value.length > data.length) throw new Error('Oversized download range');
              data.set(value, offset);
              offset += value.length;
            }
            if (offset !== data.length) throw new Error('Incomplete download range');
          } finally {
            await reader.cancel().catch(() => {});
          }
          break;
        } catch (error) {
          if (combined.aborted || error.permanent || attempt === 2) throw error;
        }
      }
      combined.throwIfAborted();
      writes = writes.then(async () => {
        combined.throwIfAborted();
        await writable.write({ type: 'write', position: start, data });
        completed += data.length;
        onProgress(completed, manifest.size);
      });
      await writes;
    }
  }

  try {
    const workers = Array.from({ length: concurrency }, () => worker().catch(error => {
      failure ||= error;
      controller.abort();
    }));
    await Promise.all(workers);
    if (failure) throw failure;
    combined.throwIfAborted();
    await writable.truncate(manifest.size);
    await writable.close();
  } catch (error) {
    controller.abort();
    await writable.abort().catch(() => {});
    throw error;
  }
}
