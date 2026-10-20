# Pare 3D for Mac

`Pare 3D.app` is a plain app bundle: the static build (`npm run export`) in
`Contents/Resources/app`, a small server (`serve.mjs`) run by a bundled Bun
runtime (`@oven/bun-darwin-aarch64` from npm), and a launcher (`Pare3D`) that
opens the app in a Chromium browser's app window with its own profile, and
falls back to the default browser.

Layout:

    Pare 3D.app/Contents/Info.plist
    Pare 3D.app/Contents/MacOS/Pare3D          (launcher, executable)
    Pare 3D.app/Contents/Resources/app/        (apps/web/.next-export)
    Pare 3D.app/Contents/Resources/serve.mjs
    Pare 3D.app/Contents/Resources/bun
    Pare 3D.app/Contents/Resources/AppIcon.icns

Pare 3D is based on layerling (https://github.com/henmedia/layerling) and,
like it, licensed AGPL-3.0-only.
