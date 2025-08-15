import * as fs from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import { glob } from "tinyglobby";
import { ModuleNode, type Plugin, type ViteDevServer } from "vite";

const PLUGIN_NAME = "vite-plugin-watch-node-modules";

function log(message: string) {
  console.log(`[${PLUGIN_NAME}] ${message}`);
}

function info(message: string) {
  console.info(`[${PLUGIN_NAME}] ${message}`);
}

function warn(message: string) {
  console.warn(`[${PLUGIN_NAME}] ${message}`);
}

function error(message: string, e: unknown) {
  console.error(`[${PLUGIN_NAME}] ${message}`, e);
}

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

export const watchNodeModules = (
  matchModules: string[],
  options?: IWatchNodeModulesChangesOptions,
): Plugin => ({
  apply: "serve",
  name: PLUGIN_NAME,
  config: (c) => ({
    optimizeDeps: {
      exclude: [...new Set(...(c.optimizeDeps?.exclude ?? []), ...matchModules)],
    },
    build: {
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  }),
  configureServer: async (server: ViteDevServer) => {
    const workingDirectory = options?.cwd || process.cwd();
    log(`Working directory: "${workingDirectory}"`);

    /*const onHMRUpdate = async (type: "create" | "delete" | "update", file: string) => {
      if (server.hot.api !== false) {
        await handleHMRUpdate(type, file, server);
      }
    };*/

    function queueUpdate(fileName: string, server: ViteDevServer) {
      if (queuedUpdates[fileName]) {
        return;
      }

      log(`Queueing file update: ${fileName}`);

      const absoluteFilename = path.normalize(path.join(workingDirectory, fileName));
      const parsedPath = path.parse(absoluteFilename);
      const actualDirectoryInSymlink = fs.realpathSync(parsedPath.dir);
      const symlinkedFilename = path.join(
        actualDirectoryInSymlink,
        parsedPath.name + parsedPath.ext,
      );

      const absoluteFilenameForwardSlash = absoluteFilename.replace(/\\/g, "/");
      const symlinkedFilenameForwardSlash = symlinkedFilename.replace(/\\/g, "/");

      // console.log("File name [original]", absoluteFilename, absoluteFilenameForwardSlash);
      // console.log("File name [symlinked]", symlinkedFilename, symlinkedFilenameForwardSlash);

      const allPaths = [
        absoluteFilename,
        absoluteFilenameForwardSlash,
        symlinkedFilename,
        symlinkedFilenameForwardSlash,
      ];

      const updateAction = async () => {
        await waitMillis(50);

        try {
          const extractedVite = extractViteModuleFileParts(fileName);

          // console.log(
          //   `Queued file update:
          // Original             [${extractedVite.originalFilePath}]
          // Without node_modules [${extractedVite.filePathWithoutNodeModules}]
          // Normal               [${extractedVite.moduleName}]
          // File In Module       [${extractedVite.fileNameOnly}]
          // Vite Module          [${extractedVite.viteModulePart}]
          // Vite Filename        [${extractedVite.viteFileName}]`,
          // );

          // const modulePartWithExtension = `${extractedVite.viteModulePart}.js`;

          const allViteIdModules = [...server.moduleGraph.idToModuleMap.values()];
          // const allViteFileSystemRequests = [...server.moduleGraph.urlToModuleMap.values()];

          // console.log("Found ID modules", allViteIdModules);
          // console.log("Found file system modules", allViteFileSystemRequests);

          // log(`All Vite modules:\n-  ${allViteModules.map((m) => m.file).join("\n-  ")}`);

          let matchedModuleMap: Map<string, ModuleNode> = new Map();

          if (allViteIdModules.length > 0) {
            for (const viteModule of allViteIdModules) {
              // console.log("Vite module importers", [...viteModule.importers]);
              // console.log("Vite module file", viteModule.file);
              // console.log(
              //   "Vite module imported modules",
              //   [...viteModule.importedModules.values()].map((v) => v.id),
              // );
              // console.log("Vite module accepted hmr deps", [...viteModule.acceptedHmrDeps]);
              // console.log("Vite module static imported urls", [
              //   ...((viteModule as any).staticImportedUrls ?? []),
              // ]);

              const modulePaths = [
                viteModule.file,
                viteModule._clientModule?.file,
                viteModule._ssrModule?.file,
              ];

              if (
                allPaths.some((p) => modulePaths.includes(p)) ||
                (viteModule.file?.includes(extractedVite.viteModulePart) &&
                  (viteModule.file?.includes(extractedVite.viteFileName) ||
                    extractedVite.viteFileName === "index.js")) ||
                path.normalize(viteModule.file ?? "") === absoluteFilename
              ) {
                matchedModuleMap.set(viteModule.id ?? "no-id", viteModule);
              }
            }
            // const matchedModules = allViteIdModules.filter(
            //   (viteModule) =>
            //     (viteModule.file?.includes(extractedVite.viteModulePart) &&
            //       (viteModule.file?.includes(extractedVite.viteFileName) ||
            //         extractedVite.viteFileName === "index.js")) ||
            //     path.normalize(viteModule.file ?? "") === absoluteFilename,
            // );

            const matchedModules = [...matchedModuleMap.values()];

            if ([...matchedModules.values()].length === 0) {
              warn(`No matching Vite module found for: ${fileName}`);
            } else {
              log(
                `Triggering file changes:\n-  ${matchedModules.map((m) => m.file).join("\n-  ")}`,
              );
            }

            for (const viteModule of matchedModules) {
              const filePath = viteModule.file;

              // if (filePath != null) {
              // delete the file
              // for (const environment of Object.values(server.environments)) {
              //   environment.moduleGraph.onFileDelete(filePath);
              // }
              // }

              await server.reloadModule(viteModule);
            }
          } else {
            warn("No Module info yet from Vite");
          }
        } catch (e) {
          error(`Error while processing file change: ${fileName}`, e);
        } finally {
          queuedUpdates[fileName] = undefined;
        }
      };

      queuedUpdates[fileName] = updateAction;

      updateAction();
    }

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
      warn(`No node_modules found to watch for: "${matchModules.join(`", "`)}"`);
    } else {
      info(`Watching node_modules changes for:\n  -${modulePaths.join("\n  -")}`);
    }

    const handleFileUpdate = (changedPath: string) => {
      if (!changedPath.endsWith(".js")) {
        return;
      }

      queueUpdate(changedPath, server);
      log(`File changed: ${changedPath}`);
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
