import { pino } from "pino";
import express from "express";
import { pinoHttp } from "pino-http";
import {
  CreateMessageSchema,
  queueConnect,
} from "@sandbox-services-example/shared";
import z from "zod";
import bodyParser from "body-parser";

const PORT = parseInt(process.env.PORT || "3000");

const logger = pino({ name: "main" });
const app = express();

const queue = await queueConnect(logger);
app.use(pinoHttp({ logger }));
app.use(bodyParser.json());

app.listen(PORT);

app.get("/", (req, res) => {
  res.status(200);
  res.send({ status: "OK" });
});

const MessageSchema = z.object({
  message: z.string(),
});

app.post("/message", async (req, res) => {
  const parsed = MessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400);
    res.send({ status: "Invalid request", errors: parsed.error });
    return;
  }

  const channel = await queue.createChannel();
  await channel.assertQueue("messages", { durable: true });
  channel.sendToQueue(
    "messages",
    Buffer.from(
      JSON.stringify({
        type: "create",
        message: parsed.data.message,
      } satisfies CreateMessageSchema)
    )
  );

  res.status(200);
  res.send({ status: "OK" });

  channel.close();
});

app.on("close", () => {
  queue.close();
});

logger.info(`Main app is running on ${PORT}`);
