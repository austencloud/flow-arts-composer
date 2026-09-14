import { renderInstagramDataDeletionStatusPage } from "./instagramDataDeletion";

describe("Instagram data deletion status page", () => {
  it("reports a completed request without exposing account data", () => {
    const html = renderInstagramDataDeletionStatusPage("complete");

    expect(html).toContain("Instagram data deletion complete");
    expect(html).toContain("https://tkaflowarts.com/delete-account");
    expect(html).not.toContain("user_id");
    expect(html).not.toContain("access_token");
    expect(html).not.toContain("<script");
  });

  it("gives a public manual deletion path when Meta checks the URL", () => {
    const html = renderInstagramDataDeletionStatusPage("instructions");

    expect(html).toContain("Delete your Flow Arts Composer data");
    expect(html).toContain("tkaflowarts@gmail.com");
  });
});
