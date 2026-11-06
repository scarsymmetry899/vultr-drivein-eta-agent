import express, { type NextFunction, type Request, type Response } from "express";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.ts";
import { databaseOk } from "./db.ts";
import { loadDotEnv } from "./env.ts";
import { inferenceConfigured } from "../agent/inference.ts";
import { loadMenu } from "./menu.ts";
import { runBoundaryProbe, runContainmentDrill, scheduleOrder } from "./schedule.ts";
import {
  createOrder,
  findOrder,
  getOrder,
  kitchenBoard,
  listUnavailable,
  markHere,
  markPickedUp,
  markReady,
} from "./store.ts";
import { kitchenConfigured, kitchenTokenFrom, requireKitchen, authorizeKitchen } from "./kitchen-auth.ts";
import { normalizePlate, parseOrderBody } from "./validate.ts";

loadDotEnv();

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use("/api/orders", rateLimit);
  app.use("/api/agent/schedule", rateLimit);

  app.get("/api/health", (_req, res) => {
    const config = loadConfig();
    const dbOk = databaseOk();
    res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      drive_in: config.driveIn,
      city: config.city,
      persistence: "sqlite",
      runner: config.sandboxRunner,
      isolation: config.sandboxRunner === "docker" ? "docker" : "none",
      fail_closed: config.sandboxRunner === "docker",
      inference_mode: config.inferenceMode,
      inference_configured: inferenceConfigured(),
      kitchen_auth: kitchenConfigured(),
    });
  });

  app.get("/api/menu", (_req, res) => {
    const config = loadConfig();
    const menu = loadMenu();
    const soldOut = new Map(listUnavailable().map((item) => [item.sku, item]));
    res.json({
      drive_in: config.driveIn,
      city: config.city,
      currency: "USD",
      sales_tax_rate: config.salesTaxRate,
      open: config.open,
      close: config.close,
      timezone: config.timezone,
      lat: config.lat,
      lng: config.lng,
      items: menu.items.map((item) => {
        const eightySix = soldOut.get(item.sku);
        return {
          ...item,
          available: !eightySix,
          unavailable_reason: eightySix?.reason ?? null,
        };
      }),
    });
  });

  app.post(
    "/api/orders",
    asyncRoute(async (req, res) => {
      const config = loadConfig();
      const parsed = parseOrderBody(req.body, config);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const order = createOrder(parsed);
      res.status(201).json({ order });
    }),
  );

  app.post(
    "/api/agent/schedule",
    asyncRoute(async (req, res) => {
      const config = loadConfig();
      const body = req.body;
      if (body === null || typeof body !== "object") {
        res.status(400).json({ error: "Schedule body must be an object." });
        return;
      }
      const record = body as Record<string, unknown>;
      if (record.containment_drill === true) {
        const decision = authorizeKitchen(kitchenTokenFrom(req));
        if (decision !== "ok") {
          res.status(decision === "unconfigured" ? 503 : 401).json({
            error: decision === "unconfigured" ? "Kitchen access is not configured." : "Kitchen token required.",
          });
          return;
        }
        const drill = await runContainmentDrill(config);
        if ("error" in drill) {
          res.status(drill.status).json({ error: drill.error, isolation: "docker", fail_closed: true });
          return;
        }
        res.json(drill);
        return;
      }
      const orderId = record.order_id;
      if (typeof orderId !== "string" || orderId.length < 8) {
        res.status(400).json({ error: "order_id is required, or set containment_drill true." });
        return;
      }
      const utterance = typeof record.utterance === "string" ? record.utterance : undefined;
      const result = await scheduleOrder(orderId, config, utterance);
      if ("error" in result) {
        const failClosed = result.status === 503;
        res.status(result.status).json({
          error: result.error,
          ...(failClosed ? { isolation: "docker", fail_closed: true } : {}),
        });
        return;
      }
      res.json(result);
    }),
  );

  app.get("/api/kitchen/board", requireKitchen, (_req, res) => {
    res.json(kitchenBoard(loadConfig()));
  });

  app.get("/api/orders/lookup", (req, res) => {
    const orderNumber = typeof req.query.order_number === "string" ? req.query.order_number.trim().toUpperCase() : "";
    const plate = normalizePlate(req.query.car_plate);
    if (!/^R66-\d{5}$/.test(orderNumber) || typeof plate !== "string") {
      res.status(400).json({ error: "Enter the ticket number and the plate on that ticket." });
      return;
    }
    const order = findOrder(orderNumber, plate);
    if (!order) {
      res.status(404).json({ error: "No ticket matches that number and plate." });
      return;
    }
    res.json({ order });
  });

  app.get("/api/orders/:id", (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const order = getOrder(id);
    if (!order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    res.json({ order });
  });

  app.post("/api/orders/:id/ready", requireKitchen, (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const result = markReady(id);
    if (!result.order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (!result.changed) {
      res.status(409).json({ error: "Only a firing ticket can be marked ready.", order: result.order });
      return;
    }
    res.json({ order: result.order });
  });

  app.post("/api/orders/:id/picked-up", requireKitchen, (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const result = markPickedUp(id);
    if (!result.order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (!result.changed) {
      res.status(409).json({ error: "Only a ready ticket can be picked up.", order: result.order });
      return;
    }
    res.json({ order: result.order });
  });

  app.post(
    "/api/agent/containment",
    requireKitchen,
    asyncRoute(async (_req, res) => {
      const result = await runBoundaryProbe(loadConfig());
      if ("error" in result) {
        res.status(result.status).json({
          error: result.error,
          isolation: result.isolation,
          fail_closed: result.isolation === "docker",
          verified: false,
        });
        return;
      }
      res.json({
        isolation: "docker",
        verified: result.report.boundaries_held,
        report: result.report,
      });
    }),
  );

  app.post("/api/orders/:id/here", (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const order = markHere(id);
    if (!order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (order.status === "completed" || order.status === "no_show") {
      res.status(409).json({ error: "That ticket is already closed.", order });
      return;
    }
    res.json({ order });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../public");
  app.use(express.static(publicDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api") || extname(req.path)) return next();
    res.sendFile(join(publicDir, "index.html"));
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const parseFailed =
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      (error as { type?: string }).type === "entity.parse.failed";
    if (parseFailed) {
      res.status(400).json({ error: "Invalid JSON." });
      return;
    }
    console.error(error instanceof Error ? error.message : "request failed");
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong." });
  });

  return app;
}

const hits = new Map<string, number[]>();

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 30) {
    res.status(429).json({ error: "Too many requests. Wait a minute." });
    return;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, stamps] of hits) {
      if (stamps.every((stamp) => now - stamp >= 60_000)) hits.delete(key);
    }
  }
  next();
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(fileURLToPath(import.meta.url)) === resolve(entry);
}

if (isDirectRun()) {
  const config = loadConfig();
  const app = createApp();
  app.listen(config.port, config.host, () => {
    console.log(`${config.driveIn} listening on http://${config.host}:${config.port}`);
  });
  setInterval(() => kitchenBoard(loadConfig()), 5_000).unref();
}
