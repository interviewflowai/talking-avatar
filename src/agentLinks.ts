/**
 * Voice agents' private links, server side (they need your API key). A private voice agent (dashboard → Voice agents →
 * Share & embed) takes calls only through its links: each works until it expires, or has started `maxUses` calls.
 * Make one per user, then send them its `url`, or put it in your page (`url + "&embed=1"` in an iframe).
 *
 *   const link = await createAgentLink({ apiKey, agentId, expiresAt: new Date(Date.now() + 3600_000), maxUses: 1 })
 */

export const DEFAULT_REST_URL = "https://backend.talking-avatar.dev/api/talking-avatar";

export interface AgentLink {
  id: string;
  /** Who or what it's for, as you named it. */
  name: string | null;
  /** The page to send: the agent's share page with the link's token. Add "&embed=1" to put it in an iframe. */
  url: string;
  /** The link's secret: the widget's `data-token`. */
  token: string;
  /** When it stops working (ISO 8601). */
  expiresAt: string;
  /** How many calls it may start; null: any number until it expires. */
  maxUses: number | null;
  /** How many calls it has started. */
  uses: number;
  createdAt: string;
}

export interface AgentLinksOptions {
  /** Your tav_… API key, from the dashboard. */
  apiKey: string;
  /** The voice agent's ID (dashboard → Voice agents). */
  agentId: string;
  /** The API's URL. Default DEFAULT_REST_URL. */
  apiUrl?: string;
}

export interface CreateAgentLinkOptions extends AgentLinksOptions {
  /** Who or what it's for, shown in the dashboard (up to 120 characters). */
  name?: string;
  /** When it stops working. Default: in 24 hours. At most a year away. */
  expiresAt?: Date | string;
  /** How many calls it may start (1: a one-time link). Default: any number until it expires. */
  maxUses?: number;
}

/** Why a request to the API failed: `status` is its HTTP status (400 options, 401 API key, 404 agent or link). */
export class TalkingAvatarApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(`talking-avatar: ${message}`);
    this.name = "TalkingAvatarApiError";
  }
}

type Row = {
  id: string; name: string | null; url: string; token: string; expires_at: string; max_uses: number | null; uses: number; created_at: string;
};
const toLink = (row: Row): AgentLink => ({
  id: row.id,
  name: row.name,
  url: row.url,
  token: row.token,
  expiresAt: row.expires_at,
  maxUses: row.max_uses,
  uses: row.uses,
  createdAt: row.created_at,
});

async function request<T>({ apiKey, agentId, apiUrl = DEFAULT_REST_URL }: AgentLinksOptions, path: string, init: RequestInit = {}): Promise<T> {
  if (!apiKey) throw new TalkingAvatarApiError(401, "apiKey is required");
  const url = `${apiUrl.replace(/\/$/, "")}/voice-agents/${encodeURIComponent(agentId)}/links${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; message?: string };
  if (!res.ok) throw new TalkingAvatarApiError(res.status, body.message || `request failed (${res.status})`);
  return body.data as T;
}

/** A new link to call a private voice agent. */
export async function createAgentLink(options: CreateAgentLinkOptions): Promise<AgentLink> {
  const { name, expiresAt, maxUses } = options;
  const body = {
    ...(name && { name }),
    ...(expiresAt && { expiresAt: new Date(expiresAt).toISOString() }),
    ...(maxUses !== undefined && { maxUses }),
  };
  return toLink(await request<Row>(options, "", { method: "POST", body: JSON.stringify(body) }));
}

/** The agent's links, newest first, expired and used-up ones included. */
export async function listAgentLinks(options: AgentLinksOptions): Promise<AgentLink[]> {
  return (await request<Row[]>(options, "")).map(toLink);
}

/** Delete a link: it stops working right away (a call already on it runs on). */
export async function deleteAgentLink(options: AgentLinksOptions & { linkId: string }): Promise<void> {
  await request(options, `/${encodeURIComponent(options.linkId)}`, { method: "DELETE" });
}
