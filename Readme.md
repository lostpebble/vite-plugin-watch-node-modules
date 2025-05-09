# vite-plugin-watch-node-modules

On NPM: https://www.npmjs.com/package/vite-plugin-watch-node-modules

A plugin to watch selected packages inside `node_modules` folders in your repo for changes, and trigger a reload in Vite.

# Features

* Hot-reload any file changes to packages inside any `node_modules` in your repo that match your provided `modules[]` array. 

## Getting Started

Install the plugin:

```
bun i -d vite-plugin-watch-node-modules
```

Then add the plugin to your Vite config:

```ts
import { watchNodeModules } from "vite-plugin-watch-node-modules";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // ...
    watchNodeModules(["@my-module/great", "my-dev-module"], {
      cwd: path.join(process.cwd(), "../../../"),
    }),
  ],
});
```

In this example, we are watching for changes to modules matching `@my-module/great` and `my-dev-module`- but our actual Vite project is
3 folders deep in the monorepo, so we add the `cwd` option to get make sure we watch for modules form the root of the repo.

## Options

The options interface is:

```
interface IWatchNodeModulesOptions {
  cwd?: string;
}
```

You can set a different `cwd` if you want to watch a different directory than the current working directory.
This is useful if you are using a monorepo setup and want to watch packages in the root of the monorepo.
