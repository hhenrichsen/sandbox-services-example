import { pino } from "pino";
import amqp from "amqplib";
import { MessageSchema, queueConnect } from "@sandbox-services-example/shared";

import postgres from "postgres";

const logger = pino({ name: "worker" });

const dbConnect = async () => {
  for (let i = 0; i < 5; i++) {
    try {
      return postgres();
    } catch (err) {
      logger.info(`Failed to connect to database. Retrying in 5s...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  throw new Error("Failed to connect to database");
};

(async () => {
  try {
    const [queue, sql]: [amqp.Connection, postgres.Sql] = await Promise.all([
      queueConnect(logger),
      dbConnect(),
    ]);

    process.once("SIGINT", async () => {
      await queue.close();
    });

    const channel = await queue.createChannel();
    await channel.assertQueue("messages", { durable: true });

    const result =
      await sql`CREATE TABLE IF NOT EXISTS messages (id SERIAL, message TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
    logger.info("Created table:");
    logger.info(result);

    channel.prefetch(1);
    await channel.consume(
      "messages",
      async (message) => {
        if (!message) {
          return;
        }

        const parsed = MessageSchema.safeParse(
          JSON.parse(message.content.toString())
        );

        if (!parsed.success) {
          channel.nack(message);
          return;
        }

        switch (parsed.data.type) {
          case "create":
            logger.info(`Got message: ${parsed.data.message}`);

            const result =
              await sql`INSERT INTO messages (message) VALUES (${parsed.data.message}) RETURNING *`;
            logger.info(result);
            break;
        }

        channel.ack(message);
      },
      { noAck: false }
    );
    logger.info("Worker is listening...");
  } catch (err) {
    logger.warn(err);
  }
})();
