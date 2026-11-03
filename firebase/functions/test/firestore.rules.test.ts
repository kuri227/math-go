import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

let environment: RulesTestEnvironment | undefined;

beforeAll(async () => {
  const rules = await readFile(resolve(process.cwd(), "../firestore.rules"), "utf8");
  environment = await initializeTestEnvironment({ projectId: "math-go-rules-test", firestore: { rules } });
});

afterAll(async () => environment?.cleanup());

describe("Firestore is callable-only", () => {
  it("denies direct unauthenticated and authenticated reads and writes", async () => {
    if (!environment) throw new Error("Rules test environment did not start");
    const anonymous = environment.unauthenticatedContext().firestore();
    const kiosk = environment.authenticatedContext("kiosk").firestore();
    await assertFails(setDoc(doc(kiosk, "leaderboardEntries", "forged"), { score: 999999 }));
    await assertFails(getDoc(doc(kiosk, "leaderboardEntries", "entry")));
    await assertFails(getDocs(collection(kiosk, "leaderboardEntries")));
    await assertFails(getDocs(collection(anonymous, "leaderboardEntries")));
    expect(true).toBe(true);
  });
});
