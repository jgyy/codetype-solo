import type { Language, Snippet } from "@codetype/shared";

export const SNIPPETS: Snippet[] = [
  {
    id: "js-001",
    language: "js",
    title: "Array reduce sum",
    code: "const sum = (xs) => xs.reduce((a, b) => a + b, 0);",
    difficulty: 2,
  },
  {
    id: "js-002",
    language: "js",
    title: "Debounce",
    code: "const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };",
    difficulty: 4,
  },
  {
    id: "py-001",
    language: "py",
    title: "List comprehension",
    code: "squares = [x * x for x in range(10) if x % 2 == 0]",
    difficulty: 2,
  },
  {
    id: "py-002",
    language: "py",
    title: "Dict get default",
    code: "def count_words(s):\n    counts = {}\n    for w in s.split():\n        counts[w] = counts.get(w, 0) + 1\n    return counts",
    difficulty: 3,
  },
  {
    id: "c-001",
    language: "c",
    title: "Strlen",
    code: "size_t strlen(const char *s) {\n    const char *p = s;\n    while (*p) p++;\n    return p - s;\n}",
    difficulty: 3,
  },
  {
    id: "go-001",
    language: "go",
    title: "Goroutine + channel",
    code: "ch := make(chan int)\ngo func() { ch <- 42 }()\nfmt.Println(<-ch)",
    difficulty: 3,
  },
];

export function pickRandom(language: Language): Snippet {
  const pool = SNIPPETS.filter((s) => s.language === language);
  if (pool.length === 0) throw new Error(`no snippets for ${language}`);
  return pool[Math.floor(Math.random() * pool.length)]!;
}
