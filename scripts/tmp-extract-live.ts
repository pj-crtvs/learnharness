/**
 * TEMPORARY (deleted after use): run the app's real extraction pipeline over
 * one chat against the live data dir, so the prose-less fallback and the
 * question gate can be observed on the actual record.
 */
import { extraction } from "../src/server/chat-handler.ts";

const chatId = process.argv[2] ?? "chat_mvnsbkp0_bbe04d8b";
const started = Date.now();
const stats = await extraction.runExtraction(chatId);
console.log(`\nruntime: ${Date.now() - started}ms`);
console.log("stats:", JSON.stringify(stats, null, 2));
