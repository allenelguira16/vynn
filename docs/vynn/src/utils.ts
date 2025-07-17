import { BundledLanguage, BundledTheme, CodeToHastOptions, codeToHtml } from "shiki";

export const syntaxHighlight = async (
  code: string,
  lang: CodeToHastOptions<BundledLanguage, BundledTheme>["lang"],
) => {
  return codeToHtml(code, {
    lang,
    theme: "tokyo-night",
    colorReplacements: {
      "#1a1b26": "transparent",
    },
  });
};
