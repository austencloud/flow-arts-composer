import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TKADatabase } from "#lib/shared/persistence/database/tka-database.js";
import { DATABASE_NAME } from "#lib/shared/persistence/domain/constants/database_constants.js";
import { MessageDeliveryRepository } from "#lib/shared/inbox/services/implementations/MessageDeliveryRepository.js";

let database: TKADatabase;
let repository: MessageDeliveryRepository;

beforeEach(async () => {
  await Dexie.delete(DATABASE_NAME);
  database = new TKADatabase();
  repository = new MessageDeliveryRepository(database);
  await database.open();
});

afterEach(async () => {
  database.close();
  await Dexie.delete(DATABASE_NAME);
});

describe("MessageDeliveryRepository", () => {
  it("moves a draft into the outbox in one database transaction", async () => {
    await repository.putDraft({
      id: "user-a:conversation-1",
      userId: "user-a",
      conversationId: "conversation-1",
      content: "Draft",
      updatedAt: 1,
    });

    await repository.promoteDraftToOutbox("user-a:conversation-1", {
      id: "message-1",
      userId: "user-a",
      conversationId: "conversation-1",
      content: "Draft",
      createdAt: 2,
      updatedAt: 2,
      status: "queued",
      attemptCount: 0,
    });

    expect(
      await repository.getDraft("user-a", "conversation-1")
    ).toBeUndefined();
    expect(await repository.listOutbox("user-a")).toEqual([
      expect.objectContaining({ id: "message-1", status: "queued" }),
    ]);
  });

  it("purges one user's private messaging data without touching another", async () => {
    await repository.putDraft({
      id: "user-a:conversation-1",
      userId: "user-a",
      conversationId: "conversation-1",
      content: "A",
      updatedAt: 1,
    });
    await repository.putDraft({
      id: "user-b:conversation-1",
      userId: "user-b",
      conversationId: "conversation-1",
      content: "B",
      updatedAt: 2,
    });

    await repository.purgeUser("user-a");

    expect(await repository.listDrafts("user-a")).toEqual([]);
    expect((await repository.listDrafts("user-b"))[0]?.content).toBe("B");
  });
});
