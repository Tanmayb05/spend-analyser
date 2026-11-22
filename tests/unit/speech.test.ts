import { describe, expect, it } from "vitest";
import { joinTranscript, speechErrorMessage } from "@/lib/speech";

const result = (transcript: string) => [{ transcript }];

describe("joinTranscript", () => {
  it("joins every result of a continuous session", () => {
    expect(joinTranscript([result("twelve fifty at Kroger"), result(" and nine dollars for gas")])).toBe("twelve fifty at Kroger and nine dollars for gas");
  });
  it("trims padding and drops empty results", () => {
    expect(joinTranscript([result("  lunch "), result("   "), result(" 12 dollars")])).toBe("lunch 12 dollars");
  });
  it("is empty when nothing was heard", () => {
    expect(joinTranscript([])).toBe("");
    expect(joinTranscript([[]])).toBe("");
  });
});

describe("speechErrorMessage", () => {
  it("stays quiet when the user stopped it", () => {
    expect(speechErrorMessage("aborted")).toBeNull();
  });
  it("explains a blocked microphone for both permission codes", () => {
    expect(speechErrorMessage("not-allowed")).toMatch(/blocked/);
    expect(speechErrorMessage("service-not-allowed")).toBe(speechErrorMessage("not-allowed"));
  });
  it("has a specific message for the common failures", () => {
    for (const code of ["no-speech", "audio-capture", "network", "language-not-supported"]) expect(speechErrorMessage(code)).toBeTruthy();
    expect(new Set(["no-speech", "audio-capture", "network"].map((c) => speechErrorMessage(c))).size).toBe(3);
  });
  it("falls back to a generic message for unknown codes", () => {
    expect(speechErrorMessage("something-new")).toMatch(/stopped unexpectedly/);
  });
});
