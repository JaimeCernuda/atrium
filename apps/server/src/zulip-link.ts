import type { FastifyInstance } from "fastify";
import type { ZulipLinkStatus } from "@atrium/shared";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { getZulipKey, getZulipLink, linkZulipAccount, unlinkZulipAccount } from "./db.js";
import { decryptZulipKey, encryptZulipKey } from "./zulip-crypto.js";
import { validateZulipKey, ZULIP_REALM } from "./zulip-client.js";

/**
 * Account-linking HTTP routes. The API key only ever travels over these
 * endpoints (POST body); it is validated against Zulip, encrypted at rest, and
 * never logged or returned. Live data (channels/messages) goes over Socket.IO.
 */
export async function registerZulipLink(app: FastifyInstance, config: Config): Promise<void> {
  const cookieName = config.session.cookieName;

  // Status: safe to call even when Zulip is unconfigured (returns unlinked).
  app.get("/api/zulip/status", async (req, reply): Promise<ZulipLinkStatus | undefined> => {
    const user = await requireUser(req, reply, cookieName);
    if (!user) return undefined;
    const link = await getZulipLink(user.id);
    return {
      linked: link.linked,
      zulipEmail: link.zulipEmail,
      ...(link.zulipUserId != null ? { zulipUserId: link.zulipUserId } : {}),
      ...(link.zulipLinkedAt ? { linkedAt: link.zulipLinkedAt.toISOString() } : {}),
    };
  });

  app.post<{ Body: { apiKey?: string; zulipEmail?: string } }>(
    "/api/zulip/link",
    async (req, reply) => {
      const user = await requireUser(req, reply, cookieName);
      if (!user) return reply;
      if (!config.zulip) {
        return reply.code(400).send({ error: "Zulip integration is not configured on this server." });
      }
      const apiKey = (req.body?.apiKey ?? "").trim();
      if (!apiKey) {
        return reply.code(400).send({ error: "An API key is required to connect Zulip." });
      }
      // Default the Zulip email to the Atrium email (same Google identity), but
      // allow an override for users whose Zulip address differs.
      const zulipEmail = (req.body?.zulipEmail ?? user.email).trim();

      const validated = await validateZulipKey(zulipEmail, apiKey);
      if (!validated) {
        return reply
          .code(400)
          .send({ error: "That Zulip email and API key did not validate against grc.zulipchat.com." });
      }

      const zulipApiKeyEnc = encryptZulipKey(apiKey);
      await linkZulipAccount(user.id, {
        zulipEmail: validated.email,
        zulipUserId: validated.userId,
        zulipApiKeyEnc,
      });

      const status: ZulipLinkStatus = {
        linked: true,
        zulipEmail: validated.email,
        zulipUserId: validated.userId,
        linkedAt: new Date().toISOString(),
      };
      return status;
    },
  );

  app.delete("/api/zulip/link", async (req, reply) => {
    const user = await requireUser(req, reply, cookieName);
    if (!user) return reply;
    await unlinkZulipAccount(user.id);
    return { ok: true };
  });

  // Authenticated passthrough for Zulip /user_uploads/* (images & file links in
  // message HTML). The browser can't fetch these directly — they need the user's
  // own Zulip key. We decrypt THAT user's key server-side, fetch with Basic auth,
  // and stream the bytes back. Locked to /user_uploads/* on the grc realm only:
  // no open proxy, no SSRF, and a user only ever sees what their own key can.
  app.get<{ Querystring: { path?: string } }>(
    "/api/zulip/upload",
    async (req, reply) => {
      const user = await requireUser(req, reply, cookieName);
      if (!user) return reply;

      const uploadPath = (req.query?.path ?? "").trim();
      // Strict allowlist: must resolve to a rooted /user_uploads/ path on the grc
      // realm. We validate the NORMALIZED URL, not the raw string — parsing first
      // applies the same %2e/.. decoding that fetch (undici/WHATWG URL) would,
      // so percent-encoded traversal like /user_uploads/%2e%2e/api/v1/users
      // collapses to /api/v1/users and is rejected here. Reject absolute URLs,
      // other endpoints, and any traversal that escapes /user_uploads/.
      let target: URL;
      try {
        target = new URL(uploadPath, ZULIP_REALM);
      } catch {
        return reply.code(403).send({ error: "Only /user_uploads/ paths are allowed." });
      }
      if (
        target.origin !== ZULIP_REALM ||
        !target.pathname.startsWith("/user_uploads/")
      ) {
        return reply.code(403).send({ error: "Only /user_uploads/ paths are allowed." });
      }

      const link = await getZulipKey(user.id);
      if (!link) {
        return reply.code(401).send({ error: "Zulip is not linked." });
      }

      let apiKey: string;
      try {
        apiKey = decryptZulipKey(link.zulipApiKeyEnc);
      } catch {
        return reply.code(401).send({ error: "Zulip key needs re-linking." });
      }

      const auth =
        "Basic " + Buffer.from(`${link.zulipEmail}:${apiKey}`).toString("base64");

      let upstream: Response;
      try {
        upstream = await fetch(target, {
          headers: { Authorization: auth },
          redirect: "manual",
        });
      } catch (err) {
        req.log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "zulip upload proxy fetch failed",
        );
        return reply.code(502).send({ error: "Upstream Zulip fetch failed." });
      }

      if (!upstream.ok) {
        return reply.code(upstream.status).send({ error: `Zulip returned ${upstream.status}.` });
      }

      const contentType = upstream.headers.get("content-type");
      if (contentType) reply.type(contentType);
      reply.header("Cache-Control", "private, immutable, max-age=86400");
      reply.header("X-Content-Type-Options", "nosniff");

      const buffer = Buffer.from(await upstream.arrayBuffer());
      return reply.send(buffer);
    },
  );
}
