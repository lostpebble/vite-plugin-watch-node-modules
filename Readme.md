# vite-plugin-watch-node-modules

A plugin to watch selected packages inside `node_modules` folders in your repo for changes, and trigger a reload in Vite.

## Getting Started

Add the node modules you would like to watch to `optimizeDeps.exclude` in your `vite.config.ts` file:

```ts
  optimizeDeps: {
    exclude: ["@my-module/great"],
  }
```

_This might be something I will add automatically to the plugin, but keeping it custom for now_

Then add the plugin to your Vite config:

```ts
import { watchNodeModules } from "vite-plugin-watch-node-modules";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // ...
    watchNodeModules(["@my-module/great"], {
      cwd: path.join(process.cwd(), "../../../"),
    }),
  ],
  // ...
});

```

## Options

The options interface is:

```
interface IWatchNodeModulesOptions {
  cwd?: string;
}
```

You can set a different `cwd` if you want to watch a different directory than the current working directory.
This is useful if you are using a monorepo setup and want to watch packages in the root of the monorepo.

## Notes

* At the moment it does a full reload of the Vite server when a change is detected. This is not ideal, but it works for now.
* The next step will be adding hot-reload functionality