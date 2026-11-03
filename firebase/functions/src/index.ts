import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { normalizeRun, scoreRun } from "./scoring.js";

initializeApp();
const db = getFirestore();
const REGION = "asia-northeast1";
const MIN_SUBMISSION_INTERVAL_MS = 5_000;

function requireIdentity(request: { auth?: unknown; app?: unknown }): asserts request is { auth: { uid: string }; app: unknown } {
  if (!request.auth || typeof (request.auth as { uid?: unknown }).uid !== "string") throw new HttpsError("unauthenticated", "Anonymous authentication is required.");
  if (!request.app) throw new HttpsError("failed-precondition", "App Check is required.");
}

export const submitScore = onCall({ region: REGION, enforceAppCheck: true, consumeAppCheckToken: true }, async (request) => {
  requireIdentity(request);
  let run;
  try { run = normalizeRun(request.data); }
  catch { throw new HttpsError("invalid-argument", "The play record is invalid."); }
  const uid = request.auth.uid;
  const documentId = `${uid}_${run.runId}`;
  const entryRef = db.collection("leaderboardEntries").doc(documentId);
  const rateRef = db.collection("submissionLimits").doc(uid);
  const score = scoreRun(run);
  await db.runTransaction(async (transaction) => {
    const [existing, rate] = await Promise.all([transaction.get(entryRef), transaction.get(rateRef)]);
    if (existing.exists) return;
    const last = rate.get("lastSubmissionAt");
    if (last instanceof Timestamp && Date.now() - last.toMillis() < MIN_SUBMISSION_INTERVAL_MS) throw new HttpsError("resource-exhausted", "Please wait before submitting again.");
    transaction.create(entryRef, {
      publicId: crypto.randomUUID(), uid, runId: run.runId, deviceId: run.deviceId,
      displayName: run.displayName ?? "ななし", difficulty: run.difficulty, ruleVersion: run.ruleVersion,
      ...score, hidden: false, createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(rateRef, { lastSubmissionAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { publicId: (await entryRef.get()).get("publicId"), ...score };
});

export const getLeaderboard = onCall({ region: REGION, enforceAppCheck: true }, async (request) => {
  requireIdentity(request);
  const difficulty = request.data?.difficulty;
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 7) throw new HttpsError("invalid-argument", "Difficulty must be 1 to 7.");
  const snapshot = await db.collection("leaderboardEntries")
    .where("difficulty", "==", difficulty).where("hidden", "==", false)
    .orderBy("score", "desc").orderBy("correct", "desc").orderBy("gold", "desc")
    .orderBy("timeRatioMillis", "asc").orderBy("createdAt", "asc").limit(10).get();
  return { entries: snapshot.docs.map((doc) => {
    const value = doc.data();
    return { publicId: value.publicId, displayName: value.displayName, score: value.score, correct: value.correct, gold: value.gold, silver: value.silver, bronze: value.bronze };
  }) };
});
