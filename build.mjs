// Builds the live site into dist/: index.html (+ 404.html for GitHub Pages) with the Supabase config baked in.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";

const cfgPath = process.env.PL_CONFIG || "config.json";
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
cfg.supabaseUrl ||= process.env.SUPABASE_URL || "";
cfg.supabaseAnonKey ||= process.env.SUPABASE_ANON_KEY || "";
cfg.siteUrl ||= process.env.SITE_URL || "";

const out = await build({ entryPoints: ["src/app.js"], bundle: true, format: "iife", minify: true, write: false, target: "es2020", legalComments: "none" });
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync("src/styles.css", "utf8");
const title = "Plumbline";
const desc = "A free church planter assessment for networks. The planter, the spouse and their references each answer on their own. Network leaders get a graded report and interview guide.";
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="Plumbline: measure true, plant strong">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#141c24">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 32"><line x1="10" y1="0" x2="10" y2="15" stroke="#141c24" stroke-width="2.4"/><path d="M10 14 L16 21 L10 32 L4 21 Z" fill="#a8802f"/></svg>')}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}${css}</style>
</head><body>
<header class="top" id="top"></header>
<main id="app"></main>
<script>window.PLUMBLINE_CONFIG=${JSON.stringify(cfg)};</script>
<script>${js}</script>
</body></html>`;
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
writeFileSync("dist/404.html", html);
if (cfg.domain) writeFileSync("dist/CNAME", cfg.domain + "\n");
console.log(`built dist/index.html ${(html.length / 1024).toFixed(0)}KB, live=${!!(cfg.supabaseUrl && cfg.supabaseAnonKey)}`);
