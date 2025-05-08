import path from "node:path";
import chokidar from "chokidar";
import { glob } from "tinyglobby";
import { createServerHotChannel, type Plugin, type ViteDevServer } from "vite";

async function waitMillis(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface IWatchNodeModulesChangesOptions {
  cwd?: string;
}

interface IExtractedViteModuleFileParts {
  originalFilePath: string;
  filePathWithoutNodeModules: string;
  fileNameOnly: string;
  viteFileName: string;
  moduleName: string;
  viteModulePart: string;
}

function toViteCacheFormat(path: string) {
  return path.replace("\\", "_").replace(".", "__");
}

function extractViteModuleFileParts(fullFilePath: string): IExtractedViteModuleFileParts {
  const lastNodeModuleIndex = fullFilePath.lastIndexOf("node_modules");
  const fileWithLastNodeModulePart = fullFilePath.slice(lastNodeModuleIndex);
  const fileNameWithoutNodeModulePath = fileWithLastNodeModulePart.slice("node_modules".length + 1);
  const pathParts = fullFilePath.split("\\");
  const fileNameOnly = pathParts[pathParts.length - 1];

  const fileExt = path.extname(fileNameOnly);

  const viteFileName = `${toViteCacheFormat(fileNameOnly.slice(0, -fileExt.length))}${fileExt}`;

  const normalModulePart = fileNameWithoutNodeModulePath.startsWith("@")
    ? fileNameWithoutNodeModulePath.split("\\").slice(0, 2).join("\\")
    : fileNameWithoutNodeModulePath.split("\\").slice(0, 1).join("\\");

  const viteModulePart = toViteCacheFormat(normalModulePart);

  return {
    originalFilePath: fullFilePath,
    filePathWithoutNodeModules: fileNameWithoutNodeModulePath,
    fileNameOnly,
    viteFileName,
    viteModulePart,
    moduleName: normalModulePart,
  };
}

interface IModuleToWatch {
  name: string;
  distPath?: string;
}

const queuedUpdates: {
  [key: string]: (() => void) | undefined;
} = {};

// C:\d\meteor-wallet-connect\node_modules\@meteorwallet\wallet-connect\dist\esm\wallet_connect_client\WalletConnectClient.js
// C:/d/meteor-wallet-connect/node_modules/@meteorwallet/wallet-connect/dist/esm/wallet_connect_client/WalletConnectClient.js

export const watchNodeModule = (
  matchModules: string[],
  options?: IWatchNodeModulesChangesOptions,
): Plugin => ({
  apply: "serve",
  name: "vite-plugin-watch-node-module",
  configureServer: async (server: ViteDevServer) => {
    const workingDirectory = options?.cwd || process.cwd();
    console.log(`[vite-plugin-watch-node-modules-changes] working directory: ${workingDirectory}`);

    function queueUpdate(fileName: string, server: ViteDevServer) {
      if (queuedUpdates[fileName]) {
        return;
      }

      const absoluteFilename = path.join(workingDirectory, fileName);
      console.log(`Absolute filename: ${absoluteFilename}`);

      const configRoot = server.config.root;
      // console.log(server.environments.client.config.root);
      console.log(`Vite config root: ${configRoot}`);

      const updateAction = async () => {
        await waitMillis(50);

        try {
          const extractedVite = extractViteModuleFileParts(fileName);

          console.log(
            `Queued file update:
Original             [${extractedVite.originalFilePath}]
Without node_modules [${extractedVite.filePathWithoutNodeModules}]
Normal               [${extractedVite.moduleName}]
File In Module       [${extractedVite.fileNameOnly}]
Vite Module          [${extractedVite.viteModulePart}]
Vite Filename        [${extractedVite.viteFileName}]`,
          );

          const allViteModules = [...server.moduleGraph.idToModuleMap.values()];

          if (allViteModules.length > 0) {
            // console.log(`Vite modules: ${allViteModules.map((m) => m.file).join(", ")}`);

            const matchedModules = allViteModules.filter(
              (viteModule) =>
                (viteModule.file?.includes(extractedVite.viteModulePart) &&
                  viteModule.file?.includes(extractedVite.viteFileName)) ||
                path.normalize(viteModule.file ?? "") === absoluteFilename,
            );

            console.info(`Matched module file changes:\n
-  ${matchedModules.map((m) => m.file).join("\n-  ")}`);

            for (const viteModule of matchedModules) {
              console.log(
                `[vite-plugin-watch-node-modules-changes] Updating module file change: ${viteModule.file}`,
              );

              server.moduleGraph.invalidateModule(viteModule);

              server.ws.send({
                type: "full-reload",
              });

              /*server.environments.client.moduleGraph.invalidateModule(
                viteModule,
                new Set(matchedModules),
                Date.now(),
                true,
              );*/

              server.hot.send({
                type: "update",
                updates: [
                  {
                    type: "js-update",
                    path: viteModule.url,
                    acceptedPath: viteModule.url,
                    timestamp: Date.now(),
                  },
                ],
              });

              const hotChannel = createServerHotChannel();
              hotChannel.send?.({
                type: "update",
                updates: [
                  {
                    type: "js-update",
                    path: viteModule.url,
                    acceptedPath: viteModule.url,
                    timestamp: Date.now(),
                  },
                ],
              });

              server.ws.send({
                type: "update",
                updates: [
                  {
                    type: "js-update",
                    path: viteModule.url,
                    acceptedPath: viteModule.url,
                    timestamp: Date.now(),
                  },
                ],
              });

              const newUrl = `${viteModule.url}?t=${Date.now()}`;
              await server.transformRequest(newUrl);
              /*server.ws.send({
                type: "full-reload",
              });
              server.environments.client.moduleGraph.invalidateModule(
                viteModule,
                new Set(matchedModules),
                Date.now(),
                true,
              );*/
            }
          } else {
            console.warn("No Module info yet from Vite");
          }
        } catch (e) {
          console.error(
            `[vite-plugin-watch-node-modules-changes] Error while processing file change: ${fileName}`,
            e,
          );
        } finally {
          queuedUpdates[fileName] = undefined;
        }
      };

      queuedUpdates[fileName] = updateAction;

      updateAction();
    }

    /*server.middlewares.use((req, res, next) => {
      console.log(`VITE REQUEST URL: "${req.url}"`);
      if (req.url === "/_cached_modules") {
        const moduleGraph = server.moduleGraph;
        const modules = Array.from(moduleGraph.idToModuleMap.values());
        const cachedModules = JSON.stringify({
          cachedModules: modules.map((m) => ({
            id: m.id,
            importedModules: Array.from(m.importedModules).map((im) => im.id),
            importers: Array.from(m.importers).map((i) => i.id),
            url: m.url,
            type: m.type,
            file: m.file,
          })),
        });

        console.log("Cached modules", cachedModules);

        res.setHeader("Content-Type", "application/json");
        res.end(cachedModules);
      } else {
        next();
      }
    });*/

    const moduleFiles = await glob(
      matchModules.map((module) => `**/node_modules/${module}`),
      {
        cwd: options?.cwd,
      },
    );

    const modulePaths = moduleFiles
      .filter((moduleFile) => {
        // Filter out for only the root package.json file
        return moduleFile.endsWith("package.json");
      })
      .map((moduleFile) => {
        // Remove the final "/package.json" from the path
        return path.normalize(moduleFile.slice(0, -13));
      });

    if (modulePaths.length === 0) {
      console.warn(
        `[vite-plugin-watch-node-modules-changes] No node_modules found to watch for: "${matchModules.join(`", "`)}"`,
      );
    } else {
      console.info(`[vite-plugin-watch-node-modules-changes] Watching node_modules changes for:
  - ${modulePaths.join("\n  -")}`);
    }

    const modules = [...server.environments.client.moduleGraph.idToModuleMap.values()].map(
      (m) => m.url,
    );

    const handleFileUpdate = (changedPath: string) => {
      if (!changedPath.endsWith(".js")) {
        return;
      }

      queueUpdate(changedPath, server);
      console.log(`File changed: ${changedPath}`);
      /*const moduleUrls = [...server.environments.client.moduleGraph.idToModuleMap.values()].map(
        (url) => {
          return url.url;
        },
      );

      console.log("Module URLS", moduleUrls);*/

      /*const normalizedPath = path.normalize(changedPath);
      const matchedModulePath = modulePaths.find((modulePath) =>
        normalizedPath.includes(modulePath),
      );

      console.log(`Matched module path: ${matchedModulePath}`);

      const modulePathAtCwd = path.join(options?.cwd || process.cwd(), matchedModulePath ?? "/");
      const moduleFileAtCwd = path.join(options?.cwd || process.cwd(), normalizedPath ?? "/");

      console.log(`Matched module path absolute: ${modulePathAtCwd}`);
      console.log(`Matched module file absolute: ${moduleFileAtCwd}`);*/

      // server.environments.client.moduleGraph.getModulesByFile();

      // const modules = server.moduleGraph.getModuleById(normalizedPath);
      // const module = server.environments.client.moduleGraph.getModuleById(normalizedPath);
      // const moduleTest = server.environments.client.moduleGraph.getModuleById(
      //   "@meteorwallet/wallet-connect",
      // );

      /*console.log(`[vite-plugin-watch-node-modules-changes] ${module}`);
      console.log(`[vite-plugin-watch-node-modules-changes] ${moduleTest}`);

      if (module) {
        console.log(`Module found: ${module.id}`);
        // server.moduleGraph.invalidateModule(module);

        // 2. Send HMR update
        server.ws.send({
          type: "update",
          updates: [
            {
              type: "js-update",
              timestamp: Date.now(),
              path: moduleFileAtCwd,
              acceptedPath: moduleFileAtCwd,
            },
          ],
        });
      }*/
    };

    const nodeModuleWatcher = chokidar.watch(modulePaths, {
      cwd: options?.cwd,
      ignoreInitial: true,
    });

    nodeModuleWatcher
      .on("change", handleFileUpdate)
      .on("add", handleFileUpdate)
      .on("unlink", handleFileUpdate);

    // Clean up watcher when server closes
    server.httpServer?.once("close", () => {
      nodeModuleWatcher.close();
    });
  },
});
