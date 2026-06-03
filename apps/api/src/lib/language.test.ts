import { describe, expect, it } from "vitest";

import {
  areLanguageTagsMutuallyIntelligible,
  canonicalizeLanguageTag,
  ensureRegionSubtag,
  getBaseLanguage,
  isRegionSpecificLanguageTag,
  resolveTranslationScope,
} from "./language";

describe("isRegionSpecificLanguageTag", () => {
  it("accepts tags with a region subtag", () => {
    expect(isRegionSpecificLanguageTag("en-US")).toBe(true);
    expect(isRegionSpecificLanguageTag("pt-BR")).toBe(true);
  });

  it("rejects bare language tags and invalid input", () => {
    expect(isRegionSpecificLanguageTag("en")).toBe(false);
    expect(isRegionSpecificLanguageTag("not a tag")).toBe(false);
  });
});

describe("canonicalizeLanguageTag", () => {
  it("normalizes casing to the BCP 47 canonical form", () => {
    expect(canonicalizeLanguageTag("PT-br")).toBe("pt-BR");
    expect(canonicalizeLanguageTag("EN-us")).toBe("en-US");
  });
});

describe("ensureRegionSubtag", () => {
  it("leaves a region-specific tag unchanged (canonicalized)", () => {
    expect(ensureRegionSubtag("pt-BR")).toBe("pt-BR");
    expect(ensureRegionSubtag("EN-us")).toBe("en-US");
  });

  it("expands a bare language tag to a default region via likely-subtags", () => {
    expect(ensureRegionSubtag("en")).toBe("en-US");
    expect(ensureRegionSubtag("pt")).toBe("pt-BR");
    expect(ensureRegionSubtag("ja")).toBe("ja-JP");
  });

  it("drops script when expanding so the result is language-region only", () => {
    // zh maximizes to zh-Hans-CN; we keep only language + region.
    expect(ensureRegionSubtag("zh")).toBe("zh-CN");
  });
});

describe("areLanguageTagsMutuallyIntelligible", () => {
  it("treats regional variants of a configured base language as redundant", () => {
    expect(areLanguageTagsMutuallyIntelligible("en-US", "en-GB")).toBe(true);
  });

  it("treats different languages as worth translating", () => {
    expect(areLanguageTagsMutuallyIntelligible("en-US", "pt-BR")).toBe(false);
  });
});

describe("getBaseLanguage", () => {
  it("extracts the base language from a region-specific tag", () => {
    expect(getBaseLanguage("en-US")).toBe("en");
    expect(getBaseLanguage("pt-BR")).toBe("pt");
  });

  it("returns the base language for a bare tag", () => {
    expect(getBaseLanguage("es")).toBe("es");
  });

  it("maps the undetermined root to 'und' (Intl reports its language as undefined)", () => {
    expect(getBaseLanguage("und")).toBe("und");
    expect(getBaseLanguage("und-US")).toBe("und");
  });

  it("falls back to the first hyphen-delimited subtag for invalid input", () => {
    // Intl.Locale throws on the space, so the catch path splits on "-".
    expect(getBaseLanguage("Bad-Tag value")).toBe("bad");
  });
});

describe("resolveTranslationScope", () => {
  it("translates the whole song when the primary is not intelligible with the target", () => {
    expect(resolveTranslationScope("pt-BR", [], "en-US")).toEqual({ kind: "full" });
  });

  it("skips when the primary language is undetermined (instrumental/vocalise)", () => {
    expect(resolveTranslationScope("und", [], "en-US")).toEqual({ kind: "skip" });
    expect(resolveTranslationScope("und", [], "pt-BR")).toEqual({ kind: "skip" });
  });

  it("skips when the primary language is empty (never resolved)", () => {
    expect(resolveTranslationScope("", [], "pt-BR")).toEqual({ kind: "skip" });
  });

  it("skips when the primary and every secondary are intelligible with the target", () => {
    const secondary = [{ language: "en-GB", lineIndices: [3, 4] }];
    expect(resolveTranslationScope("en-US", secondary, "en-US")).toEqual({ kind: "skip" });
  });

  it("skips when the primary is intelligible and there are no secondaries", () => {
    expect(resolveTranslationScope("en-US", [], "en-GB")).toEqual({ kind: "skip" });
  });

  it("returns partial scope with the foreign line indices when the primary is intelligible", () => {
    const secondary = [
      { language: "fr-FR", lineIndices: [14, 12, 13] },
      { language: "en-GB", lineIndices: [2] }, // intelligible with target -> excluded
    ];
    expect(resolveTranslationScope("en-US", secondary, "en-US")).toEqual({
      kind: "partial",
      lineIndices: [12, 13, 14],
    });
  });

  it("deduplicates and sorts foreign line indices across secondaries", () => {
    const secondary = [
      { language: "fr-FR", lineIndices: [5, 1] },
      { language: "es-ES", lineIndices: [1, 2] },
    ];
    expect(resolveTranslationScope("en-US", secondary, "en-US")).toEqual({
      kind: "partial",
      lineIndices: [1, 2, 5],
    });
  });
});
