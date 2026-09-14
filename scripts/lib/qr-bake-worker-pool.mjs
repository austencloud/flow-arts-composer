import { Worker } from "node:worker_threads";

/** Drawing happens in workers; the app generator supplies every styling option. */
export class QrBakeWorkerPool {
  constructor(
    canvasModule,
    count = 4,
    { entry = "qr-bake-worker.mjs", runtime = {}, invoke } = {}
  ) {
    this.nextId = 0;
    this.queue = [];
    this.workers = Array.from({ length: count }, () => {
      const slot = {
        worker: new Worker(new URL(`./${entry}`, import.meta.url), {
          workerData: { canvasModule, ...runtime },
        }),
        job: null,
      };
      slot.worker.on("message", async ({ svg, bytes, error, rpc, payload }) => {
        if (rpc !== undefined) {
          try {
            slot.worker.postMessage({
              rpc,
              response: { result: await invoke(payload) },
            });
          } catch (error) {
            slot.worker.postMessage({
              rpc,
              response: {
                error: { message: error.message, stack: error.stack },
              },
            });
          }
          return;
        }
        const job = slot.job;
        slot.job = null;
        if (error) job.reject(new Error(error));
        else job.resolve(Buffer.from(bytes ?? svg));
        this.dispatch();
      });
      slot.worker.on("error", (error) => {
        this.failure = error;
        slot.job?.reject(error);
        slot.job = null;
        for (const job of this.queue.splice(0)) job.reject(error);
      });
      return slot;
    });
  }
  render(options) {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, options, resolve, reject });
      this.dispatch();
    });
  }
  dispatch() {
    for (const slot of this.workers) {
      if (slot.job || !this.queue.length) continue;
      slot.job = this.queue.shift();
      slot.worker.postMessage({ id: slot.job.id, options: slot.job.options });
    }
  }
  async close() {
    await Promise.all(this.workers.map(({ worker }) => worker.terminate()));
  }
}
