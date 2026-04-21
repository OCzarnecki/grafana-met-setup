#!/usr/bin/env node
// Renders a static index.html for the Meticulous frontend-only container.
// Mirrors the FEMT boot flow at pkg/services/frontend/index.html: a stub
// window.grafanaBootData is injected inline, then an inline boot script fetches
// /bootdata via XHR. Meticulous mocks /bootdata (and all other backend calls)
// at replay time, so no Grafana backend is required.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [, , manifestPathArg, outPathArg] = process.argv;
if (!manifestPathArg || !outPathArg) {
  console.error('usage: render-index.mjs <assets-manifest.json> <out-index.html>');
  process.exit(1);
}

const manifestPath = resolve(manifestPathArg);
const outPath = resolve(outPathArg);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

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

// Match pkg/api/dtos.EntryPointAssets JSON shape.
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

// Initial settings/user stubs. Meticulous replays /bootdata which overwrites
// these before the React app renders, but we still need theme/language set so
// the initial CSS link chooses the right stylesheet and the preloader renders.
const initialUser = { theme: 'dark', language: 'en', lightTheme: false };
const initialSettings = {};

const cssLinks = cssFiles
  .map((a) => `    <link rel="stylesheet" href="/${a.filePath}" />`)
  .join('\n');

const jsScripts = jsFiles
  .map((a) => `    <script src="/${a.filePath}" type="text/javascript" defer></script>`)
  .join('\n');

const html = `<!DOCTYPE html>
<html class="fs-loading">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
    <meta name="viewport" content="width=device-width" />
    <meta name="theme-color" content="#000" />

    <title>Grafana</title>

    <base href="/" />

    <link rel="icon" id="grafana_favicon" type="image/png" href="/public/img/fav32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/public/img/apple-touch-icon.png" />
    <link rel="mask-icon" href="/public/img/grafana_mask_icon.svg" color="#F05A28" />

${cssLinks}
    <link rel="stylesheet" href="/${assets.dark}" />

    <script src="https://snippet.meticulous.ai/v1/meticulous.js" data-token="ceD9Uoa4XN0ST1SjIHfzgAgYrK0WrKQzJ4QTTsrZ"></script>

    <script>
      performance.mark('frontend_boot_css_time_seconds');
    </script>
  </head>

  <body>
    <div class="preloader">
      <style>
        :root {
          --fs-loader-bg: #f4f5f5;
          --fs-loader-text-color: rgb(36, 41, 46);
          --fs-spinner-arc-color: #F55F3E;
          --fs-spinner-track-color: rgba(36, 41, 46, 0.12);
          --fs-color-error: #e0226e;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --fs-loader-bg: #111217;
            --fs-loader-text-color: rgb(204, 204, 220);
            --fs-spinner-arc-color: #F55F3E;
            --fs-spinner-track-color: rgba(204, 204, 220, 0.12);
            --fs-color-error: #d10e5c;
          }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        body { background-color: var(--fs-loader-bg); color: var(--fs-loader-text-color); margin: 0; }
        .preloader {
          display: flex; flex-direction: column; align-items: center;
          height: 100dvh; justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1;
        }
        .fs-variant-loader, .fs-variant-error { display: contents; }
        .fs-hidden { display: none; }
        .fs-spinner { animation: spin 1500ms linear infinite; width: 32px; height: 32px; }
        .fs-spinner-arc { stroke: #F55F3E; }
        .fs-loader-text { opacity: 0; font-size: 16px; margin-bottom: 0; transition: opacity 300ms ease-in-out; }
        .fs-loader-starting-up .fs-loader-text { opacity: 1; }
        .fs-variant-error .fs-loader-text { opacity: 1; }
        .fs-error-icon { fill: var(--fs-color-error); }
      </style>

      <div class="fs-variant-loader">
        <svg width="32" height="32" class="fs-spinner" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle class="fs-spinner-track" cx="50" cy="50" r="45" fill="none" stroke-width="10" />
          <circle class="fs-spinner-arc" cx="50" cy="50" r="45" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="70.7 212.3" stroke-dashoffset="0" />
        </svg>
        <p class="fs-loader-text">Grafana is starting up...</p>
      </div>

      <div class="fs-variant-error fs-hidden">
        <svg width="32" height="32" class="fs-error-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12,14a1.25,1.25,0,1,0,1.25,1.25A1.25,1.25,0,0,0,12,14Zm0-1.5a1,1,0,0,0,1-1v-3a1,1,0,0,0-2,0v3A1,1,0,0,0,12,12.5ZM12,2A10,10,0,1,0,22,12,10.01114,10.01114,0,0,0,12,2Zm0,18a8,8,0,1,1,8-8A8.00917,8.00917,0,0,1,12,20Z"/>
        </svg>
        <p class="fs-loader-text">Error loading Grafana</p>
      </div>
    </div>

    <div id="reactRoot"></div>

    <script>
      window.__grafanaPublicDashboardAccessToken = null;
      window.grafanaBootData = {
        _femt: true,
        assets: ${JSON.stringify(assets)},
        navTree: [],
        settings: ${JSON.stringify(initialSettings)},
        user: ${JSON.stringify(initialUser)}
      };
    </script>

    <script>
      (() => {
        const publicDashboardAccessToken = window.__grafanaPublicDashboardAccessToken;
        let hasFailedToBoot = false;
        window.__grafana_load_failed = function(err) {
          if (hasFailedToBoot) { return; }
          hasFailedToBoot = true;
          console.error('Failed to load Grafana', err);
          document.querySelector('.fs-variant-loader').classList.add('fs-hidden');
          document.querySelector('.fs-variant-error').classList.remove('fs-hidden');
          fetch(\`/-/fe-boot-error?ts=\${Date.now()}\${Math.random()}\`, { method: 'GET', cache: "no-store" })
            .catch((err) => { console.error('Failed to report boot error to backend: ', err); });
        };

        window.onload = function() {
          if (window.__grafana_app_bundle_loaded) { return; }
          window.__grafana_load_failed();
        };

        let hasSetLoading = false;
        function setLoading() {
          if (hasSetLoading) { return; }
          document.querySelector('.preloader').classList.add('fs-loader-starting-up');
          hasSetLoading = true;
        }

        const CHECK_INTERVAL = 1 * 1000;

        async function fetchBootData() {
          const queryParams = new URLSearchParams(window.location.search);
          let path = '/bootdata';
          if (publicDashboardAccessToken) {
            path += \`/\${publicDashboardAccessToken}\`;
          }
          const bootDataUrl = new URL(path, window.location.origin);
          for (const [key, value] of queryParams.entries()) {
            bootDataUrl.searchParams.append(key, value);
          }
          const resp = await fetch(bootDataUrl);
          if (resp.status === 204) {
            const redirectDomain = resp.headers.get('Redirect-Domain');
            if (redirectDomain) { window.location.hostname = redirectDomain; return; }
          }
          const textResponse = await resp.text();
          let rawBootData;
          try { rawBootData = JSON.parse(textResponse); }
          catch { throw new Error("Unexpected response type: " + textResponse); }
          if (resp.status === 503 && rawBootData.code === 'Loading') { return; }
          if (!resp.ok) { throw new Error("Unexpected response body: " + textResponse); }
          return rawBootData;
        }

        function loadBootData() {
          return new Promise((resolve, reject) => {
            const attemptFetch = async () => {
              try {
                const bootData = await fetchBootData();
                if (!bootData) { setLoading(); setTimeout(attemptFetch, CHECK_INTERVAL); return; }
                resolve(bootData);
              } catch (error) { reject(error); }
            };
            attemptFetch();
          });
        }

        async function initGrafana() {
          const { navTree, settings, user, redirect } = await loadBootData();
          if (redirect) { return Promise.reject({ redirect }); }

          window.grafanaBootData.settings = { ...settings, ...window.grafanaBootData.settings };
          window.grafanaBootData.navTree = navTree;
          window.grafanaBootData.user = user;
          if (settings?.buildInfo?.edition) {
            window.grafanaBootData.settings.buildInfo.edition = settings.buildInfo.edition;
          }

          const cssLink = document.createElement("link");
          cssLink.rel = 'stylesheet';
          const theme = window.grafanaBootData.user.theme;
          if (theme === "system") {
            const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
            window.grafanaBootData.user.lightTheme = !darkQuery.matches;
          }
          const isLightTheme = window.grafanaBootData.user.lightTheme;
          document.body.classList.add(isLightTheme ? "theme-light" : "theme-dark");
          const lang = window.grafanaBootData.user.language;
          if (lang) { document.documentElement.lang = lang; }
          cssLink.href = window.grafanaBootData.assets[isLightTheme ? 'light' : 'dark'];
          document.head.appendChild(cssLink);
        }

        window.__grafana_boot_data_promise = initGrafana();
        window.__grafana_boot_data_promise.catch((err) => {
          if (err && err.redirect && typeof err.redirect === 'string') {
            window.location.href = err.redirect;
            return;
          }
          console.error("__grafana_boot_data_promise rejected", err);
          window.__grafana_load_failed(err);
        });
      })();
    </script>

${jsScripts}

    <script>
      performance.mark('frontend_boot_js_done_time_seconds');
    </script>
  </body>
</html>
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
console.log(`Wrote ${outPath} (${jsFiles.length} js, ${cssFiles.length} css)`);
