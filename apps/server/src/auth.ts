import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import oauth2, { type OAuth2Namespace } from "@fastify/oauth2";
import jwtPlugin from "@fastify/jwt";
import type { User } from "@atrium/shared";
import { isEmailAllowed, type Config } from "./config.js";
import { prisma, upsertUser } from "./db.js";

declare module "fastify" {
  interface FastifyInstance {
    googleOAuth2: OAuth2Namespace;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: User;
    user: User;
  }
}

interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}

async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google profile fetch failed: ${res.status}`);
  return res.json() as Promise<GoogleProfile>;
}

export async function getUser(
  req: FastifyRequest,
  cookieName: string,
): Promise<User | null> {
  const token = req.cookies[cookieName];
  if (!token) return null;
  try {
    return await req.jwtVerify<User>({ onlyCookie: false, decode: { complete: false } } as never);
  } catch {
    try {
      return req.server.jwt.verify<User>(token);
    } catch {
      return null;
    }
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

export async function registerAuth(app: FastifyInstance, config: Config): Promise<void> {
  await app.register(jwtPlugin, {
    secret: config.session.secret,
    cookie: { cookieName: config.session.cookieName, signed: false },
  });

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
    const token = await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(req);
    const profile = await fetchGoogleProfile(token.token.access_token);

    if (!profile.email) {
      return reply.code(403).send({ error: "No email on Google profile" });
    }
    if (!isEmailAllowed(profile.email, config.whitelistDomains)) {
      return reply.code(403).send({ error: `Email domain not allowed: ${profile.email}` });
    }

    const user: User = {
      id: profile.sub,
      name: profile.name,
      email: profile.email,
      imageUrl: profile.picture,
    };
    await upsertUser(user, config.adminEmails);

    const jwt = app.jwt.sign(user, { expiresIn: `${Math.floor(config.session.maxAge / 1000)}s` });
    reply.setCookie(config.session.cookieName, jwt, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.publicUrl.startsWith("https://"),
      maxAge: Math.floor(config.session.maxAge / 1000),
    });
    reply.redirect("/");
  });

  app.post("/auth/logout", async (req, reply) => {
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
}
