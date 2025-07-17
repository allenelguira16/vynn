import { createHighlighterCore, StringLiteralUnion } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import { $state } from "vynn";

type CodeBlockProps = {
  code: string;
  lang: StringLiteralUnion<string, string>;
};

const highlighter = await createHighlighterCore({
  themes: [import("@shikijs/themes/tokyo-night")],
  langs: [
    import("@shikijs/langs/tsx"),
    import("@shikijs/langs/bash"),
    import("@shikijs/langs/json5"),
  ],
  engine: createOnigurumaEngine(import("shiki/wasm")),
});

export const CodeBlock = ({ code: rawCode, lang }: CodeBlockProps) => {
  const code = parse(rawCode);
  const isCopied = $state(false);

  const parsedCode = highlighter.codeToHtml(code, {
    lang,
    theme: "tokyo-night",
    colorReplacements: {
      "#1a1b26": "transparent",
    },
  });

  const copyToClipboard = () => {
    isCopied.value = true;
    navigator.clipboard.writeText(code);
  };

  const onMouseLeave = () => {
    if (!isCopied.value) return;

    setTimeout(() => {
      isCopied.value = false;
    }, 500);
  };

  return (
    <div class="relative">
      <div class="not-prose multiline-mockup-code" html={parsedCode} />
      <button
        onClick={copyToClipboard}
        onMouseLeave={onMouseLeave}
        data-tip={!isCopied.value ? "Copy to clipboard" : "Copied"}
        class="btn btn-square absolute top-2 right-2 tooltip tooltip-left"
      >
        <svg class="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
          <path d="M 16 3 C 14.742188 3 13.847656 3.890625 13.40625 5 L 6 5 L 6 28 L 26 28 L 26 5 L 18.59375 5 C 18.152344 3.890625 17.257813 3 16 3 Z M 16 5 C 16.554688 5 17 5.445313 17 6 L 17 7 L 20 7 L 20 9 L 12 9 L 12 7 L 15 7 L 15 6 C 15 5.445313 15.445313 5 16 5 Z M 8 7 L 10 7 L 10 11 L 22 11 L 22 7 L 24 7 L 24 26 L 8 26 Z"></path>
        </svg>
      </button>
    </div>
  );
};

function parse(str: string) {
  const lines = str.split("\n");
  if (lines.length === 0) return "";

  // Find the minimum indentation level (excluding empty lines)
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length === 0) continue; // Ignore empty lines for indentation calculation
    const match = line.match(/^\s*/);
    if (match && match[0].length < minIndent) {
      minIndent = match[0].length;
    }
  }

  if (minIndent === Infinity) return str.trim(); // All lines were empty or just whitespace

  // Remove that minimum indentation from each line
  return lines
    .map((line) => line.substring(minIndent))
    .join("\n")
    .replace(/^\s+/, "");
}
