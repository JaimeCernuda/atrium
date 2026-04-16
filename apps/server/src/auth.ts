import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import oauth2, { type OAuth2Namespace } from "@fastify/oauth2";
import jwtPlugin from "@fastify/jwt";
import type { User } from "@atrium/shared";
import { isEmailAllowed, type Config } from "./config.js";
import { prisma, upsertUser } from "./db.js";

declare module "fastify" {
  interface FastifyInstance {
    googleOAuth2?: OAuth2Namespace;
    microsoftOAuth2?: OAuth2Namespace;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: User;
    user: User;
  }
}

interface OAuthProfile {
  id: string;
  email: string;
  name: string;
  imageUrl?: string;
}

async function fetchGoogleProfile(accessToken: string): Promise<OAuthProfile> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google profile fetch failed: ${res.status}`);
  const body = (await res.json()) as {
    sub: string;
    email: string;
    name: string;
    picture?: string;
  };
  return { id: `google:${body.sub}`, email: body.email, name: body.name, imageUrl: body.picture };
}

async function fetchMicrosoftProfile(accessToken: string): Promise<OAuthProfile> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Microsoft profile fetch failed: ${res.status}`);
  const body = (await res.json()) as {
    id: string;
    displayName: string;
    mail?: string;
    userPrincipalName?: string;
  };
  const email = body.mail ?? body.userPrincipalName ?? "";
  return { id: `microsoft:${body.id}`, email, name: body.displayName };
}

export async function getUser(
  req: FastifyRequest,
  cookieName: string,
): Promise<User | null> {
  const token = req.cookies[cookieName];
  if (!token) return null;
  try {
    return req.server.jwt.verify<User>(token);
  } catch {
    return null;
  }
}

export async function requireUser(
  req: FastifyRequest,
  reply: FastifyReply,
  cookieName: string,
): Promise<User | null> {
  const user = await getUser(req, cookieName);
  if (!user) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  return user;
}

function issueSessionAndRedirect(
  app: FastifyInstance,
  reply: FastifyReply,
  config: Config,
  user: User,
): void {
  const jwt = app.jwt.sign(user, { expiresIn: `${Math.floor(config.session.maxAge / 1000)}s` });
  reply.setCookie(config.session.cookieName, jwt, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.publicUrl.startsWith("https://"),
    maxAge: Math.floor(config.session.maxAge / 1000),
  });
  reply.redirect("/");
}

export async function registerAuth(app: FastifyInstance, config: Config): Promise<void> {
  await app.register(jwtPlugin, {
    secret: config.session.secret,
    cookie: { cookieName: config.session.cookieName, signed: false },
  });

  if (config.google) {
    await app.register(oauth2, {
      name: "googleOAuth2",
      scope: ["openid", "email", "profile"],
      credentials: {
        client: { id: config.google.clientId, secret: config.google.clientSecret },
        auth: {
          authorizeHost: "https://accounts.google.com",
          authorizePath: "/o/oauth2/v2/auth",
          tokenHost: "https://www.googleapis.com",
          tokenPath: "/oauth2/v4/token",
        },
      },
      startRedirectPath: "/auth/google",
      callbackUri: config.google.callbackUrl,
    });

    app.get("/auth/google/callback", async (req, reply) => {
      const token = await app.googleOAuth2!.getAccessTokenFromAuthorizationCodeFlow(req);
      const profile = await fetchGoogleProfile(token.token.access_token);
      const user = await handleProfile(profile, config, reply);
      if (user) issueSessionAndRedirect(app, reply, config, user);
    });
  }

  if (config.microsoft) {
    const tenant = config.microsoft.tenant;
    await app.register(oauth2, {
      name: "microsoftOAuth2",
      scope: ["openid", "email", "profile", "User.Read"],
      credentials: {
        client: { id: config.microsoft.clientId, secret: config.microsoft.clientSecret },
        auth: {
          authorizeHost: "https://login.microsoftonline.com",
          authorizePath: `/${tenant}/oauth2/v2.0/authorize`,
          tokenHost: "https://login.microsoftonline.com",
          tokenPath: `/${tenant}/oauth2/v2.0/token`,
        },
      },
      startRedirectPath: "/auth/microsoft",
      callbackUri: config.microsoft.callbackUrl,
    });

    app.get("/auth/microsoft/callback", async (req, reply) => {
      const token = await app.microsoftOAuth2!.getAccessTokenFromAuthorizationCodeFlow(req);
      const profile = await fetchMicrosoftProfile(token.token.access_token);
      const user = await handleProfile(profile, config, reply);
      if (user) issueSessionAndRedirect(app, reply, config, user);
    });
  }

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(config.session.cookieName, { path: "/" });
    reply.send({ ok: true });
  });

  app.get("/api/me", async (req, reply) => {
    const user = await getUser(req, config.session.cookieName);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isAdmin: true },
    });
    return { ...user, isAdmin: dbUser?.isAdmin ?? false };
  });

  app.get("/api/auth/providers", async () => ({
    google: config.google !== null,
    microsoft: config.microsoft !== null,
  }));
}

async function handleProfile(
  profile: OAuthProfile,
  config: Config,
  reply: FastifyReply,
): Promise<User | null> {
  if (!profile.email) {
    reply.code(403).send({ error: "no email on profile" });
    return null;
  }
  if (!isEmailAllowed(profile.email, config.whitelistDomains)) {
    reply.code(403).send({ error: `email domain not allowed: ${profile.email}` });
    return null;
  }
  const user: User = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    imageUrl: profile.imageUrl,
  };
  await upsertUser(user, config.adminEmails);
  return user;
}
