const port = Number(process.argv[2] ?? 9223);
const pageUrl = process.argv[3] ?? "http://127.0.0.1:8000/";
const sizes = [
  [1920, 1080],
  [1280, 720],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [844, 390],
  [320, 568],
];

const targetResponse = await fetch(
  `http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`,
  { method: "PUT" },
);
if (!targetResponse.ok) {
  throw new Error(`CDP target creation failed: HTTP ${targetResponse.status}`);
}
const target = await targetResponse.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const eventWaiters = new Map();
let sequence = 0;

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.id) {
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
    return;
  }
  const waiters = eventWaiters.get(message.method) ?? [];
  eventWaiters.delete(message.method);
  waiters.forEach((resolve) => resolve(message.params));
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++sequence;
  const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  socket.send(JSON.stringify({ id, method, params }));
  return promise;
}

function waitForEvent(method, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const waiters = eventWaiters.get(method) ?? [];
    waiters.push(resolve);
    eventWaiters.set(method, waiters);
    setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
  });
}

await send("Page.enable");
const results = [];
for (const [width, height] of sizes) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const loaded = waitForEvent("Page.loadEventFired");
  await send("Page.navigate", { url: `${pageUrl}?layout=${width}x${height}` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 250));
  const evaluated = await send("Runtime.evaluate", {
    expression: `(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const value = element.getBoundingClientRect();
        return { left: value.left, top: value.top, right: value.right, bottom: value.bottom };
      };
      const inside = (value) => value && value.left >= -0.5 && value.top >= -0.5 && value.right <= innerWidth + 0.5 && value.bottom <= innerHeight + 0.5;
      const keyRects = [
        rect('.title-copy'),
        rect('.course-selector'),
        rect('#difficultyList'),
        rect('.course-list'),
        rect('#startButton'),
      ];
      const choiceRects = [...document.querySelectorAll('.difficulty-option, .course-option')]
        .map((element) => {
          const value = element.getBoundingClientRect();
          return { left: value.left, top: value.top, right: value.right, bottom: value.bottom };
        });
      return {
        viewport: [innerWidth, innerHeight],
        documentSize: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        startButton: keyRects[4],
        keyRects,
        choiceBounds: choiceRects.reduce((bounds, value) => ({
          left: Math.min(bounds.left, value.left),
          top: Math.min(bounds.top, value.top),
          right: Math.max(bounds.right, value.right),
          bottom: Math.max(bounds.bottom, value.bottom),
        }), { left: innerWidth, top: innerHeight, right: 0, bottom: 0 }),
        fits: document.documentElement.scrollWidth <= innerWidth
          && document.documentElement.scrollHeight <= innerHeight
          && keyRects.filter((value) => value && value.right > value.left && value.bottom > value.top).every(inside)
          && choiceRects.every(inside),
      };
    })()`,
    returnByValue: true,
  });
  results.push({ width, height, ...evaluated.result.value });
}

console.table(results.map(({ width, height, documentSize, startButton, fits }) => ({
  viewport: `${width}x${height}`,
  document: documentSize.join("x"),
  startBottom: Math.round(startButton.bottom),
  fits,
})));

if (results.some(({ fits }) => !fits)) process.exitCode = 1;
results.filter(({ fits }) => !fits).forEach((result) => console.dir(result, { depth: null }));
await send("Browser.close").catch(() => undefined);
socket.close();
