// Copies the MediaPipe WebAssembly runtime out of node_modules into public/ so the optional
// camera coach loads everything from this app's own origin (no third-party CDN, which the CSP
// would block anyway). The model file (public/mediapipe/face_landmarker.task) is checked in.
import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(dirname(require.resolve("@mediapipe/tasks-vision")), "wasm");
const target = join(root, "public", "mediapipe", "wasm");

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
