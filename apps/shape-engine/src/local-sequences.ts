// Shape Engine generates complete sequences on device. Composer's cloud
// gallery is not a source for this host; the player keeps its supplied data.
const localSequences = {
  async getSequence(_identifier: string): Promise<null> {
    return null;
  },
};

export function getSequenceRepository() {
  return localSequences;
}
