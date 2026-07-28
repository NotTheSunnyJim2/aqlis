import type { Redis } from "ioredis";
import type { Logger } from "../logger.js";

export interface StreamConsumerOptions<TEntry> {
  redis: Redis;
  streamKey: string;
  groupName: string;
  consumerName: string;
  parseEntry: (fields: string[]) => TEntry | null;
  handleEntry: (entry: TEntry) => Promise<void>;
  logger: Logger;
  /** How long XREADGROUP blocks waiting for new entries before
   * returning empty — an efficient wait, not a busy-poll loop. */
  blockMs?: number;
  batchSize?: number;
}

/**
 * Ensures a consumer group exists on a stream.
 *
 * Starts from '0' (not '$') so a FRESH group sees the stream's entire
 * history — this is what lets the consumer we're about to run pick up
 * everything the price/fundamentals workers already wrote during their
 * earlier live runs, not just entries added from this moment on.
 * MKSTREAM creates the stream itself if it somehow doesn't exist yet.
 *
 * Idempotent: BUSYGROUP ("group already exists") is the expected
 * outcome on every restart after the first and is swallowed; any other
 * error is real and rethrown.
 */
export async function ensureConsumerGroup(
  redis: Redis,
  streamKey: string,
  groupName: string,
): Promise<void> {
  try {
    await redis.xgroup("CREATE", streamKey, groupName, "0", "MKSTREAM");
  } catch (err) {
    if (err instanceof Error && err.message.includes("BUSYGROUP")) {
      return;
    }
    throw err;
  }
}

/**
 * Processes one delivered entry: parse -> handle -> XACK.
 *
 * A malformed entry (parseEntry -> null) or a handler failure (e.g. a
 * Postgres write throws) is logged and left UN-acked — per the Phase 6
 * hands-on lesson, an unacked entry stays in the consumer group's
 * pending list and will be redelivered, rather than silently lost.
 *
 * Exported standalone, not a class method, so it's directly unit
 * testable without driving the class's infinite read loop.
 */
export async function processStreamEntry<TEntry>(
  redis: Redis,
  streamKey: string,
  groupName: string,
  id: string,
  fields: string[],
  parseEntry: (fields: string[]) => TEntry | null,
  handleEntry: (entry: TEntry) => Promise<void>,
  logger: Logger,
): Promise<void> {
  const parsed = parseEntry(fields);
  if (!parsed) {
    logger.warn({ id, streamKey }, "unparseable stream entry, leaving pending");
    return;
  }

  try {
    await handleEntry(parsed);
    await redis.xack(streamKey, groupName, id);
  } catch (err) {
    logger.error(
      { id, streamKey, err: err instanceof Error ? err.message : String(err) },
      "failed to handle stream entry, leaving pending for retry",
    );
  }
}

/**
 * Long-running consumer-group loop for one stream. Runs until stop()
 * is called; each iteration blocks on XREADGROUP rather than spinning.
 */
export class StreamConsumer<TEntry> {
  private running = false;

  constructor(private readonly options: StreamConsumerOptions<TEntry>) {}

  async start(): Promise<void> {
    await ensureConsumerGroup(this.options.redis, this.options.streamKey, this.options.groupName);
    this.running = true;
    while (this.running) {
      await this.readOnce();
    }
  }

  stop(): void {
    this.running = false;
  }

  private async readOnce(): Promise<void> {
    const blockMs = this.options.blockMs ?? 5_000;
    const batchSize = this.options.batchSize ?? 50;

    const result = (await this.options.redis.xreadgroup(
      "GROUP",
      this.options.groupName,
      this.options.consumerName,
      "COUNT",
      batchSize,
      "BLOCK",
      blockMs,
      "STREAMS",
      this.options.streamKey,
      ">",
    )) as [string, [string, string[]][]][] | null;

    const streamResult = result?.[0];
    if (!streamResult) {
      return; // BLOCK timed out with nothing new — normal, loop again
    }

    const [, entries] = streamResult;
    for (const [id, fields] of entries) {
      await processStreamEntry(
        this.options.redis,
        this.options.streamKey,
        this.options.groupName,
        id,
        fields,
        this.options.parseEntry,
        this.options.handleEntry,
        this.options.logger,
      );
    }
  }
}
