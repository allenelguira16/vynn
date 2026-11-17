import bashGrammar from "@speed-highlight/core/languages/bash.js";
import htmlGrammar from "@speed-highlight/core/languages/html.js";
import jsdocGrammar from "@speed-highlight/core/languages/jsdoc.js";
import jsonGrammar from "@speed-highlight/core/languages/json.js";
import regexGrammar from "@speed-highlight/core/languages/regex.js";
import todoGrammar from "@speed-highlight/core/languages/todo.js";
import tsGrammar from "@speed-highlight/core/languages/ts.js";
import "@speed-highlight/core/themes/github-dim.css";
import { tokenizeWith } from "@speed-highlight/core/tokenize";
import { $state } from "vynn";

const grammars = {
  json: jsonGrammar,
  ts: tsGrammar,
  bash: bashGrammar,
  html: htmlGrammar,
};

const nestedGrammars = {
  jsdoc: jsdocGrammar,
  todo: todoGrammar,
  regex: regexGrammar,
};

function escapeHTML(value: string) {
  return value.replaceAll("&", "&#38;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function wrapHTML(content: string): string {
  return `<div><div class="shj-numbers"></div><div>${content}</div></div>`;
}

function highlight(code: string, lang: keyof typeof grammars): string {
  if (lang !== "json" && lang !== "ts" && lang !== "bash") {
    return wrapHTML(escapeHTML(code));
  }

  const grammar = grammars[lang];
  const tokens: string[] = [];

  tokenizeWith(
    code,
    grammar,
    (text, token) => {
      const content = escapeHTML(text);

      tokens.push(token ? `<span class="shj-syn-${token}">${content}</span>` : content);
    },
    { languages: nestedGrammars },
  );

  return wrapHTML(tokens.join(""));
}

type CodeBlockProps = {
  code: string;
  lang: keyof typeof grammars;
};

export const CodeBlock = ({ code: rawCode, lang }: CodeBlockProps) => {
  const code = parse(rawCode);
  const isCopied = $state(() => false);

  // Synchronous. No dynamic imports or asynchronous resources.
  const parsedCode = highlight(code, lang);

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
      <div class="not-prose multiline-mockup-code">
        <pre>
          <code html={parsedCode}></code>
        </pre>
      </div>

      <button
        onClick={copyToClipboard}
        onMouseLeave={onMouseLeave}
        data-tip={!isCopied.value ? "Copy to clipboard" : "Copied"}
        aria-label="Copy to clipboard"
        class="btn btn-square absolute top-2 right-2 tooltip tooltip-left"
      >
        <svg class="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
          <path d="M 16 3 C 14.742188 3 13.847656 3.890625 13.40625 5 L 6 5 L 6 28 L 26 28 L 26 5 L 18.59375 5 C 18.152344 3.890625 17.257813 3 16 3 Z M 16 5 C 16.554688 5 17 5.445313 17 6 L 17 7 L 20 7 L 20 9 L 12 9 L 12 7 L 15 7 L 15 6 C 15 5.445313 15.445313 5 16 5 Z M 8 7 L 10 7 L 10 11 L 22 11 L 22 7 L 24 7 L 24 26 L 8 26 Z" />
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
