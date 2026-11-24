# crawlee v4: a failing stream in `KeyValueStore.setValue` crashes the process

Minimal reproduction. The same script survives on crawlee 3 and crashes on crawlee 4.

## Run it

```sh
npm install
npm run v3   # crawlee 3.18.2
npm run v4   # crawlee 4.0.0-rc.2
```

Both versions are installed side by side as npm aliases (`crawlee3`, `crawlee4`).

## Result

```
$ npm run v3
crawlee 3.18.2, node v26.12.1
setValue rejected: connection cut off
OK: the process survived

$ npm run v4
crawlee 4.0.0-rc.2, node v26.12.1
node:internal/process/promises:324
    triggerUncaughtException(err, true /* fromPromise */);
    ^
Error: connection cut off
```

Same result in 3 of 3 runs on each version.

## What the script does

It saves a stream into a key-value store while the stream's source fails midway, as when a
download's connection drops:

```js
const body = new PassThrough();
const piping = pipeline(source, body);

try {
    await store.setValue('file', body, { contentType: 'application/octet-stream' });
    await piping;
} catch (error) {
    piping.catch(() => {});
    console.log(`setValue rejected: ${error.message}`);
}
```

The pipeline promise gets its handler only when `setValue` rejects.

- **crawlee 3:** `setValue` rejects in the same tick as the pipeline, so the handler is attached
  before Node checks for unhandled rejections.
- **crawlee 4:** `setValue` rejects about 2 ms after the pipeline. Node sees the pipeline's
  rejection as unhandled first, and the process exits.

The delay comes from the local storage backend. In crawlee 4, `@crawlee/fs-storage` converts the
Node stream with `Readable.toWeb()` and writes it through the native backend
(`setValueStream`), which reports the error later. With the Apify platform storage (apify-client)
the same code survives on crawlee 4 too.

No crawler and no Apify SDK are needed; a crawler's request handler behaves the same way.

## Workaround

Await `setValue` and the pipeline together, so both promises have a handler from the start:

```js
await Promise.all([
    store.setValue('file', body, { contentType: 'application/octet-stream' }),
    pipeline(source, body),
]);
```

Inside a crawlee 4 request handler, a stream `setValue` also has to be wrapped in
`withDirectStorageAccess()`.

## Expected

Either `setValue` rejects as soon as the stream errors (as in crawlee 3), or the upgrade guide
mentions that a stream `setValue` can settle later than the stream itself.
