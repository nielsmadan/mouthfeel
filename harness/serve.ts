import { createServer, type IncomingMessage } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { artifactRoot, feedbackFile } from "./config.js";

export type FeedbackMap = Record<string, Record<string, unknown>>;

// The history archive is owned here, not by the page: clients only signal
// archivePrevious, so a stale tab can add to history but never rewrite it.
export function mergeFeedback(existing: FeedbackMap, incoming: unknown): FeedbackMap {
  if (typeof incoming !== "object" || incoming === null) throw new Error("feedback body must be an object");
  const { archivePrevious, history: _clientHistory, ...row } = incoming as Record<string, unknown>;
  const key = row["key"];
  if (typeof key !== "string" || key === "" || key.length > 300) throw new Error("feedback needs a key");
  const previous = existing[key];
  const kept = Array.isArray(previous?.["history"]) ? (previous["history"] as unknown[]) : [];
  const history = [...kept];
  if (archivePrevious === true && previous && (previous["text"] || previous["rating"])) {
    const { history: _previousHistory, ...archived } = previous;
    history.push(archived);
  }
  return { ...existing, [key]: { ...row, ...(history.length > 0 ? { history } : {}) } };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 256 * 1024) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function loadFeedback(): Promise<FeedbackMap> {
  try {
    return JSON.parse(await readFile(feedbackFile, "utf8")) as FeedbackMap;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  const portArg = process.argv.find((a) => a.startsWith("--port="));
  const port = portArg ? Number(portArg.slice("--port=".length)) : 4173;
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method === "GET" && (req.url === "/" || req.url === "/review.html")) {
        try {
          const html = await readFile(join(artifactRoot, "review.html"));
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
        } catch {
          res.writeHead(404).end("review.html not generated yet — run: npm run eval:review -- <run-dirs...>");
        }
        return;
      }
      if (req.method === "GET" && req.url === "/api/feedback") {
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify(await loadFeedback()));
        return;
      }
      if (req.method === "POST" && req.url === "/api/feedback") {
        const body: unknown = JSON.parse(await readBody(req));
        const merged = mergeFeedback(await loadFeedback(), body);
        await mkdir(join(feedbackFile, ".."), { recursive: true });
        await writeFile(feedbackFile, JSON.stringify(merged, null, 2) + "\n");
        const key = (body as Record<string, unknown>)["key"];
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({
            ok: true,
            count: Object.keys(merged).length,
            ...(typeof key === "string" ? { row: merged[key] } : {}),
          }));
        return;
      }
      res.writeHead(404).end("not found");
    })().catch((error: unknown) => {
      res.writeHead(400, { "content-type": "text/plain" }).end(String(error));
    });
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Voice Lab at http://127.0.0.1:${port} — feedback saves to ${feedbackFile}`);
  });
}

if (process.argv[1]?.endsWith("serve.ts")) await main();
