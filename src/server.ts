import express, { type NextFunction, type Request, type Response } from "express";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.ts";
import { loadDotEnv } from "./env.ts";
import { loadMenu } from "./menu.ts";
import { runContainmentDrill, scheduleOrder } from "./schedule.ts";
import { createOrder, kitchenBoard, listUnavailable, markHere } from "./store.ts";
import { parseOrderBody } from "./validate.ts";

loadDotEnv();

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => {
    const config = loadConfig();
    res.json({
      ok: true,
      drive_in: config.driveIn,
      city: config.city,
      runner: config.sandboxRunner,
      inference: "stub-unless-configured",
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
        res.json(await runContainmentDrill(config));
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
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result);
    }),
  );

  app.get("/api/kitchen/board", (_req, res) => {
    res.json(kitchenBoard(loadConfig()));
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
