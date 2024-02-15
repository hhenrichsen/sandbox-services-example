import { z } from "zod";
import amqp from "amqplib";

export const CreateMessageSchema = z.object({
  type: z.literal("create"),
  message: z.string(),
});

export type CreateMessage = z.infer<typeof CreateMessageSchema>;

export const MessageSchema = z.discriminatedUnion("type", [
  CreateMessageSchema,
]);

export type Message = z.infer<typeof MessageSchema>;

export const queueConnect = async (
  logger: { info: (p: string) => void },
  retries: number = 5
) => {
  const url = process.env.AMQP_URL || "amqp://localhost";
  logger.info(`Connecting to queue on ${url}`);

  let lastErr = undefined;
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqp.connect(url);
      return conn;
    } catch (err) {
      lastErr = err;
      logger.info(`Failed to connect to queue. Retrying in 5s...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  throw new Error("Failed to connect to queue", { cause: lastErr });
};
