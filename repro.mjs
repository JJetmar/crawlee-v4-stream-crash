// Saves a stream that fails midway into a key-value store; see README.md.
import { createRequire } from 'node:module';
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const pkg = process.argv[2]; // crawlee3 or crawlee4, both installed as npm aliases
const { KeyValueStore } = await import(pkg);
const { version } = createRequire(import.meta.url)(`${pkg}/package.json`);
console.log(`crawlee ${version}, node ${process.version}`);

const store = await KeyValueStore.open();

const source = new Readable({ read() {} });
source.push(Buffer.alloc(1000));
setTimeout(() => source.destroy(new Error('connection cut off')), 100);

const body = new PassThrough();
const piping = pipeline(source, body);

try {
    await store.setValue('file', body, { contentType: 'application/octet-stream' });
    await piping;
} catch (error) {
    piping.catch(() => {});
    console.log(`setValue rejected: ${error.message}`);
}

console.log('OK: the process survived');
