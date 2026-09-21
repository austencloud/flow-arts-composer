import { afterEach, describe, expect, it, vi } from "vitest";
import { CardExportTrace } from "$lib/shared/render/services/card-export-trace";

afterEach(() => vi.restoreAllMocks());

describe("card export timing", () => {
  it("keeps overlapping requests separate and reports elapsed time rather than summed spans", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const output = vi.spyOn(console, "info").mockImplementation(() => {});
    const first = new CardExportTrace(true);
    const endOuter = first.start("decoration");
    now = 10;
    const second = new CardExportTrace(true);
    const endNested = first.start("qr");
    const endSecond = second.start("cells");
    now = 30;
    endNested();
    endSecond();
    second.finish();
    now = 40;
    endOuter();
    first.finish();
    first.finish();
    const reports = output.mock.calls.map((call) => JSON.parse(call[1]));
    expect(reports).toHaveLength(2);
    expect(reports[0].id).not.toBe(reports[1].id);
    expect(reports[0].durationMs).toBe(20);
    expect(reports[1].durationMs).toBe(40);
    expect(
      reports[1].spans.map((span: { durationMs: number }) => span.durationMs)
    ).toEqual([40, 20]);
  });

  it("preserves failures and identifies stages that did not finish", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const output = vi.spyOn(console, "info").mockImplementation(() => {});
    const trace = new CardExportTrace(true);
    trace.start("card");
    const error = new Error("offline");
    await expect(
      trace.measure("qr", async () => {
        throw error;
      })
    ).rejects.toBe(error);
    trace.finish("error");
    const report = JSON.parse(output.mock.calls[0]![1]);
    expect(report.outcome).toBe("error");
    expect(report.spans[0].incomplete).toBe(true);
    expect(report.spans[1].detail.outcome).toBe("error");
  });

  it("does not emit measurements when disabled", async () => {
    const output = vi.spyOn(console, "info");
    const measure = vi.spyOn(performance, "measure");
    const trace = new CardExportTrace(false);
    await expect(trace.measure("cells", async () => 42)).resolves.toBe(42);
    trace.finish();
    expect(output).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
  });
});
