import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentLink, deleteAgentLink, listAgentLinks, TalkingAvatarApiError } from "../src/server.ts";

const AGENT = "7b0c5a52-2b7e-4a8e-9a43-4bb0d6f6f0a1";
const ROW = {
  id: "l1", name: "Jane", url: `https://app.talking-avatar.dev/agent/${AGENT}?token=t`, token: "t",
  expires_at: "2026-11-02T18:00:00.000Z", max_uses: 1, uses: 0, created_at: "2026-10-26T10:00:00.000Z",
};

/** Stands in for the API: records each request, answers with `reply`. */
function fakeFetch(reply: { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

test("createAgentLink posts the options with the API key and returns the link", async () => {
  const calls = fakeFetch({ status: 201, body: { data: ROW, code: 201 } });
  const link = await createAgentLink({
    apiKey: "tav_k", agentId: AGENT, name: "Jane", expiresAt: new Date("2026-11-02T18:00:00Z"), maxUses: 1,
  });
  assert.equal(calls[0].url, `https://backend.talking-avatar.dev/api/talking-avatar/voice-agents/${AGENT}/links`);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(calls[0].init.headers, { Authorization: "Bearer tav_k", "Content-Type": "application/json" });
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { name: "Jane", expiresAt: "2026-11-02T18:00:00.000Z", maxUses: 1 });
  assert.deepEqual(link, {
    id: "l1", name: "Jane", url: ROW.url, token: "t", expiresAt: ROW.expires_at, maxUses: 1, uses: 0, createdAt: ROW.created_at,
  });
  // the defaults are the API's
  await createAgentLink({ apiKey: "tav_k", agentId: AGENT, apiUrl: "http://localhost:8888/api/talking-avatar/" });
  assert.equal(calls[1].url, `http://localhost:8888/api/talking-avatar/voice-agents/${AGENT}/links`);
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), {});
});

test("listAgentLinks and deleteAgentLink", async () => {
  let calls = fakeFetch({ body: { data: [ROW] } });
  assert.equal((await listAgentLinks({ apiKey: "tav_k", agentId: AGENT }))[0].expiresAt, ROW.expires_at);
  assert.equal(calls[0].init.method, undefined);
  assert.deepEqual(calls[0].init.headers, { Authorization: "Bearer tav_k" });
  calls = fakeFetch({ body: { data: { id: "l1" } } });
  await deleteAgentLink({ apiKey: "tav_k", agentId: AGENT, linkId: "l1" });
  assert.equal(calls[0].url.endsWith(`/voice-agents/${AGENT}/links/l1`), true);
  assert.equal(calls[0].init.method, "DELETE");
});

test("a failed request throws TalkingAvatarApiError with the status and the API's message", async () => {
  fakeFetch({ status: 401, body: { code: 401, message: "Invalid API key" } });
  await assert.rejects(createAgentLink({ apiKey: "tav_bad", agentId: AGENT }), (error: unknown) => {
    assert.ok(error instanceof TalkingAvatarApiError);
    assert.equal(error.status, 401);
    assert.equal(error.message, "talking-avatar: Invalid API key");
    return true;
  });
  await assert.rejects(listAgentLinks({ apiKey: "", agentId: AGENT }), { status: 401 });
});
