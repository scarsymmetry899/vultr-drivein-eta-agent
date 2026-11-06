import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type KitchenDecision = "ok" | "denied" | "unconfigured";

/** Empty token means the pit is locked, not public. Comparison does not stop early on length. */
export function authorizeKitchen(presented: string | undefined, expected = process.env.KITCHEN_TOKEN): KitchenDecision {
  const secret = expected?.trim() ?? "";
  if (!secret) return "unconfigured";
  const given = Buffer.from(presented?.trim() ?? "");
  const want = Buffer.from(secret);
  const lengthOk = given.length === want.length;
  const left = lengthOk ? given : want;
  const match = timingSafeEqual(left, want);
  return lengthOk && match ? "ok" : "denied";
}

export function kitchenTokenFrom(req: Request): string | undefined {
  const header = req.get("x-kitchen-token");
  if (header) return header;
  const authorization = req.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

export function requireKitchen(req: Request, res: Response, next: NextFunction): void {
  const decision = authorizeKitchen(kitchenTokenFrom(req));
  if (decision === "ok") {
    next();
    return;
  }
  res.status(decision === "unconfigured" ? 503 : 401).json({
    error: decision === "unconfigured" ? "Kitchen access is not configured." : "Kitchen token required.",
  });
}

export function kitchenConfigured(): boolean {
  return Boolean(process.env.KITCHEN_TOKEN?.trim());
}
