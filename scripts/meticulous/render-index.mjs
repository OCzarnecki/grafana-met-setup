#!/usr/bin/env node
// Renders a static index.html for the Meticulous frontend-only container.
//
// Meticulous replays recorded network traffic against the image, so the
// container must match whatever calls (or absence of calls) the baseline
// recorded. The baseline was captured against monolith Grafana, which
// INLINES window.grafanaBootData into the HTML via a Go template and never
// fetches /bootdata. We reproduce that pattern here: we load a committed
// bootdata.json, merge in the freshly-built asset paths, inline the whole
// thing, and resolve window.__grafana_boot_data_promise immediately.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [, , manifestPathArg, bootdataPathArg, outPathArg] = process.argv;
if (!manifestPathArg || !bootdataPathArg || !outPathArg) {
  console.error(
    'usage: render-index.mjs <assets-manifest.json> <bootdata.json> <out-index.html>'
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(resolve(manifestPathArg), 'utf8'));
const bootdata = JSON.parse(readFileSync(resolve(bootdataPathArg), 'utf8'));

const integrityByPath = Object.create(null);
for (const v of Object.values(manifest)) {
  if (v && typeof v === 'object' && v.src && v.integrity) {
    integrityByPath[v.src] = v.integrity;
  }
}

const entry = manifest.entrypoints;
if (!entry?.app?.assets?.js?.length) {
  throw new Error('missing app.js entries in assets-manifest (did yarn build run?)');
}
if (!entry?.dark?.assets?.css?.length || !entry?.light?.assets?.css?.length) {
  throw new Error('missing dark/light css entries in assets-manifest');
}

const jsFiles = entry.app.assets.js.map((filePath) => ({
  filePath,
  integrity: integrityByPath[filePath] ?? '',
}));
const cssFiles = entry.app.assets.css.map((filePath) => ({
  filePath,
  integrity: integrityByPath[filePath] ?? '',
}));

// Match pkg/api/dtos.EntryPointAssets JSON shape. Overrides whatever `assets`
// was in the captured bootdata — those hashes are stale by definition.
const assets = {
  jsFiles,
  cssFiles,
  dark: entry.dark.assets.css[0],
  light: entry.light.assets.css[0],
  swagger: (entry.swagger?.assets?.js ?? []).map((filePath) => ({
    filePath,
    integrity: integrityByPath[filePath] ?? '',
  })),
  swaggerCssFiles: (entry.swagger?.assets?.css ?? []).map((filePath) => ({
    filePath,
    integrity: integrityByPath[filePath] ?? '',
  })),
};

const mergedBootData = {
  ...bootdata,
  assets,
};

const user = mergedBootData.user ?? {};
const themeClass = user.lightTheme ? 'theme-light' : 'theme-dark';
const lang = user.language || 'en';

const cssLinks = cssFiles
  .map((a) => `    <link rel="stylesheet" href="/${a.filePath}" />`)
  .join('\n');

const jsScripts = jsFiles
  .map((a) => `    <script src="/${a.filePath}" type="text/javascript" defer></script>`)
  .join('\n');

// Keep </script> literals inside the JSON safe for HTML parsing.
const safeJSON = (value) => JSON.stringify(value).replace(/<\/script/gi, '<\\/script');

const html = `<!DOCTYPE html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
    <meta name="viewport" content="width=device-width" />
    <meta name="theme-color" content="#000" />

    <title>Grafana</title>

    <base href="/" />

    <link rel="icon" type="image/png" href="/public/img/fav32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/public/img/apple-touch-icon.png" />
    <link rel="mask-icon" href="/public/img/grafana_mask_icon.svg" color="#F05A28" />

${cssLinks}
    <link rel="stylesheet" href="/${user.lightTheme ? assets.light : assets.dark}" />

    <script src="https://snippet.meticulous.ai/v1/meticulous.js" data-token="ceD9Uoa4XN0ST1SjIHfzgAgYrK0WrKQzJ4QTTsrZ"></script>

    <script>
      performance.mark('frontend_boot_css_time_seconds');
    </script>
  </head>

  <body class="${themeClass}">
    <div id="reactRoot"></div>

    <script>
      window.grafanaBootData = ${safeJSON(mergedBootData)};
      // Monolith index.html contract: public/app/index.ts awaits this promise.
      window.__grafana_boot_data_promise = Promise.resolve();
      window.__grafana_app_bundle_loaded = false;
    </script>

${jsScripts}

    <script>
      performance.mark('frontend_boot_js_done_time_seconds');
    </script>
  </body>
</html>
`;

const outPath = resolve(outPathArg);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
console.log(
  `Wrote ${outPath} (${jsFiles.length} js, ${cssFiles.length} css, bootdata fields: ${Object.keys(mergedBootData).join(', ')})`
);
