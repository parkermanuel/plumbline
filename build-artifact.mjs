// Builds the demo (no database) as a single page for a claude.ai artifact: samples plus the pilot's code-based flow.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
const out = await build({ entryPoints: ["src/app.js"], bundle: true, format: "iife", minify: true, write: false, target: "es2020", legalComments: "none" });
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync("src/styles.css", "utf8");
mkdirSync("dist", { recursive: true });
writeFileSync("dist/plumbline-demo.html", `<title>Plumbline</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap">
<style>${css}</style>
<header class="top" id="top"></header>
<main id="app"></main>
<footer class="foot" id="foot"></footer>
<script>${js}</script>
`);
console.log("built dist/plumbline-demo.html");
