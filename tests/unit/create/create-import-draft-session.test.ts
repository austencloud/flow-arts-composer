import { describe, expect, it, vi } from "vitest";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { CreateModuleInitializer } from "#lib/features/create/shared/services/create-module-initializer.js";
import type { DeepLinkSequenceHandler } from "#lib/features/create/shared/services/deep-link-sequence-handler.js";
import type { SequencePersister } from "#lib/features/create/shared/services/sequence-persister.js";

describe("Create sequence imports", () => {
  it.each([
    ["spell", "generate"],
    ["assemble", "assemble"],
    ["shape-engine", "construct"],
  ] as const)("opens %s in the %s draft session", async (targetTab, mode) => {
    const sequence = createSequenceData({ id: `import-${targetTab}` });
    const beginNewSession = vi.fn().mockResolvedValue(undefined);
    const persister = { beginNewSession } as unknown as SequencePersister;
    const deepLink = {
      loadFromAnySource: vi.fn(
        async (setSequence: (value: typeof sequence) => void) => {
          setSequence(sequence);
          return { loaded: true, targetTab };
        }
      ),
    } as unknown as DeepLinkSequenceHandler;
    const unused = null as never;
    const initializer = new CreateModuleInitializer(
      unused,
      persister,
      unused,
      unused,
      unused,
      unused,
      unused,
      deepLink,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused
    );
    const setSequence = vi.fn();
    const initializePersistence = vi.fn().mockResolvedValue(undefined);

    await initializer.loadSequenceAndInitializePersistence(
      setSequence,
      initializePersistence
    );

    expect(beginNewSession).toHaveBeenCalledWith(mode);
    expect(initializePersistence).toHaveBeenCalledWith(true);
    expect(setSequence).toHaveBeenCalledWith(sequence, mode);
    expect(beginNewSession.mock.invocationCallOrder[0]).toBeLessThan(
      setSequence.mock.invocationCallOrder[0]!
    );
  });
});
