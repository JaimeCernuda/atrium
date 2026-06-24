import type { FastifyInstance } from "fastify";
import type { ZulipLinkStatus } from "@atrium/shared";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { getZulipLink, linkZulipAccount, unlinkZulipAccount } from "./db.js";
import { encryptZulipKey } from "./zulip-crypto.js";
import { validateZulipKey } from "./zulip-client.js";

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
}
