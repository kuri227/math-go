import { afterEach, expect, it, vi } from "vitest";
import { requestJson } from "./http";
import { RecognitionClient } from "./RecognitionClient";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("returns JSON and releases its timeout", async () => {
  vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true}')));
  expect(await requestJson("/test")).toEqual({ ok: true }); expect(vi.getTimerCount()).toBe(0);
});
it.each([{ detail: "invalid" }, { detail: [{ msg: "missing field" }] }])("shows useful server validation messages: %j", async body => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 })));
  await expect(requestJson("/test")).rejects.toThrow(typeof body.detail === "string" ? "invalid" : "missing field");
});
it("preserves non-JSON HTTP failures and rejects malformed success bodies", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("offline", { status: 503 })).mockResolvedValueOnce(new Response("invalid"));
  vi.stubGlobal("fetch", fetch);
  await expect(requestJson("/test")).rejects.toThrow("HTTP 503");
  await expect(requestJson("/test")).rejects.toThrow("正しい応答");
});
it.each(["judgement", "solution", "sample", "review"])("bounds %s requests and permits retry", async method => {
  vi.useFakeTimers();
  const fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")))));
  vi.stubGlobal("fetch", fetch); const client = new RecognitionClient();
  const operation = method === "judgement" ? client.judge("q", "1") : method === "solution" ? client.fetchSolution("q") : method === "sample" ? client.saveSample(new FormData()) : client.reviewQuestion("q", "approved", true);
  const assertion = expect(operation).rejects.toThrow(method === "sample" ? "保存の応答" : "通信が時間内");
  await vi.advanceTimersByTimeAsync(15_001); await assertion;
  expect(vi.getTimerCount()).toBe(0);
  fetch.mockResolvedValueOnce(new Response('{"ok":true}'));
  expect(await requestJson("/retry")).toEqual({ ok: true });
});
it("retains the 30-second recognition timeout", async () => {
  vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError"))))));
  const assertion = expect(new RecognitionClient().recognize(new Blob(["ink"]), "request")).rejects.toThrow("30秒");
  await vi.advanceTimersByTimeAsync(30_000); await assertion;
});
