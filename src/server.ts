import express, { type NextFunction, type Request, type Response } from "express";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.ts";
import { databaseOk } from "./db.ts";
import { loadDotEnv } from "./env.ts";
import { inferenceConfigured, liveCallStatus } from "../agent/inference.ts";
import { loadMenu } from "./menu.ts";
import { runBoundaryProbe, runContainmentDrill, runFailClosedDrill, scheduleOrder } from "./schedule.ts";
import {
  createOrder,
  findOrder,
  getOrder,
  kitchenBoard,
  listUnavailable,
  applyApproach,
  markDemoPayment,
  markHere,
  markPickedUp,
  markReady,
  promoteDueFires,
  setArrivalWatch,
  setFireHold,
  staffStart,
} from "./store.ts";
import { assessApproach } from "./arrival.ts";
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
    const liveCall = liveCallStatus();
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
      inference_endpoint: "https://api.vultrinference.com/v1",
      live_call_verified: liveCall.verified,
      live_call_at: liveCall.at,
      live_call_model: liveCall.model,
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

  app.post(
    "/api/agent/fail-closed",
    requireKitchen,
    asyncRoute(async (_req, res) => {
      res.json(await runFailClosedDrill(loadConfig()));
    }),
  );

  app.post("/api/orders/:id/approach", (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const body = req.body;
    if (body === null || typeof body !== "object") {
      res.status(400).json({ error: "Approach body must be an object." });
      return;
    }
    const record = body as Record<string, unknown>;
    const source = record.source;
    if (source !== "sim-close" && source !== "sim-far" && source !== "device") {
      res.status(400).json({ error: "Approach source must be sim-close, sim-far, or device." });
      return;
    }
    if (typeof record.recorded_at !== "string") {
      res.status(400).json({ error: "Approach needs a recorded_at timestamp." });
      return;
    }
    const config = loadConfig();
    const assessment = assessApproach({
      source,
      recordedAt: record.recorded_at,
      accuracyM: typeof record.accuracy_m === "number" ? record.accuracy_m : null,
      lat: typeof record.lat === "number" ? record.lat : null,
      lng: typeof record.lng === "number" ? record.lng : null,
      lotLat: config.lat,
      lotLng: config.lng,
    });
    const result = applyApproach(id, assessment, config);
    if (!result.order) {
      res.status(404).json({ error: "Order not found.", live_gps_verified: false });
      return;
    }
    res.json({
      applied: result.applied,
      refired: false,
      live_gps_verified: false,
      code: result.code,
      note: result.note,
      https_required_for_device_gps: true,
      order: result.order,
    });
  });

  app.post("/api/orders/:id/arrival-watch", (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const enabled = req.body !== null && typeof req.body === "object" && (req.body as { enabled?: unknown }).enabled === true;
    const order = setArrivalWatch(id, enabled);
    if (!order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (order.status !== "confirmed" && order.arrival_opt_in !== enabled) {
      res.status(409).json({ error: "Close-arrival watch can change only before the grill starts.", order });
      return;
    }
    res.json({ order, live_gps_verified: false });
  });

  app.post("/api/orders/:id/hold", requireKitchen, (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const held = !(req.body !== null && typeof req.body === "object" && (req.body as { held?: unknown }).held === false);
    const result = setFireHold(id, held);
    if (!result.order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (result.order.status !== "confirmed") {
      res.status(409).json({ error: "Only a waiting ticket can be held or released.", order: result.order });
      return;
    }
    res.json({ order: result.order, changed: result.changed });
  });

  app.post("/api/orders/:id/start", requireKitchen, (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const result = staffStart(id);
    if (!result.order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (!result.changed && result.order.status === "confirmed") {
      res.status(409).json({ error: result.note, order: result.order });
      return;
    }
    res.json({ order: result.order, changed: result.changed });
  });

  app.post("/api/orders/:id/demo-payment", requireKitchen, (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const result = markDemoPayment(id);
    if (!result.order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (result.error) {
      res.status(409).json({ error: result.error, order: result.order });
      return;
    }
    res.json({ order: result.order, changed: result.changed, live_charge: false });
  });

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
    if (order.fire_hold && order.status === "confirmed") {
      res.status(409).json({ error: "Kitchen staff are holding this fire. The stall check-in did not start cooking.", order });
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
  // Due scheduled fires move to cooking while this process is up. Ready stays a staff action.
  setInterval(() => promoteDueFires(), 5_000).unref();
}
