import { describe, expect, it } from "vitest";
import { classifyOpen } from "@/server/outbound/open-source";

describe("classifyOpen", () => {
  it("counts Gmail's on-open image proxy as a confirmed open", () => {
    expect(classifyOpen("Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)")).toBe("confirmed");
  });

  it("counts Yahoo's proxy as confirmed", () => {
    expect(classifyOpen("YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html")).toBe("confirmed");
  });

  it("treats Apple Mail Privacy Protection's proxy as automatic", () => {
    expect(classifyOpen("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)")).toBe("automatic");
  });

  it("counts iPhone Mail on the device as confirmed", () => {
    expect(classifyOpen("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148")).toBe("confirmed");
  });

  it("counts a desktop browser (webmail) as confirmed", () => {
    expect(
      classifyOpen("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    ).toBe("confirmed");
  });

  it("counts Outlook desktop and mobile as confirmed (they load images on open)", () => {
    expect(classifyOpen("Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17531; Pro)")).toBe("confirmed");
    expect(classifyOpen("Outlook-iOS-Android/1.0")).toBe("confirmed");
  });

  it("ignores security gateways and scripts", () => {
    expect(classifyOpen("Mozilla/5.0 (compatible; Barracuda Sentinel)")).toBe("scanner");
    expect(classifyOpen("python-requests/2.31.0")).toBe("scanner");
    expect(classifyOpen("curl/8.5.0")).toBe("scanner");
  });

  it("treats a missing or unknown agent as not a person", () => {
    expect(classifyOpen(null)).toBe("scanner");
    expect(classifyOpen("")).toBe("scanner");
    expect(classifyOpen("SomeFetcher/1.0")).toBe("scanner");
  });
});
