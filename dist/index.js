"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchNodeModules = void 0;
const fs = __importStar(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const chokidar_1 = __importDefault(require("chokidar"));
const tinyglobby_1 = require("tinyglobby");
const PLUGIN_NAME = "vite-plugin-watch-node-modules";
function log(message) {
    console.log(`[${PLUGIN_NAME}] ${message}`);
}
function info(message) {
    console.info(`[${PLUGIN_NAME}] ${message}`);
}
function warn(message) {
    console.warn(`[${PLUGIN_NAME}] ${message}`);
}
function error(message, e) {
    console.error(`[${PLUGIN_NAME}] ${message}`, e);
}
function waitMillis(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    });
}
function toViteCacheFormat(path) {
    return path.replace("\\", "_").replace(".", "__");
}
function extractViteModuleFileParts(fullFilePath) {
    const lastNodeModuleIndex = fullFilePath.lastIndexOf("node_modules");
    const fileWithLastNodeModulePart = fullFilePath.slice(lastNodeModuleIndex);
    const fileNameWithoutNodeModulePath = fileWithLastNodeModulePart.slice("node_modules".length + 1);
    const pathParts = fullFilePath.split("\\");
    const fileNameOnly = pathParts[pathParts.length - 1];
    const fileExt = node_path_1.default.extname(fileNameOnly);
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
const queuedUpdates = {};
const watchNodeModules = (matchModules, options) => ({
    apply: "serve",
    name: PLUGIN_NAME,
    config: (c) => {
        var _a, _b;
        return ({
            optimizeDeps: {
                exclude: [...new Set(...((_b = (_a = c.optimizeDeps) === null || _a === void 0 ? void 0 : _a.exclude) !== null && _b !== void 0 ? _b : []), ...matchModules)],
            },
            build: {
                rollupOptions: {
                    output: {
                        inlineDynamicImports: true,
                    },
                },
            },
        });
    },
    configureServer: (server) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const workingDirectory = (options === null || options === void 0 ? void 0 : options.cwd) || process.cwd();
        log(`Working directory: "${workingDirectory}"`);
        function queueUpdate(fileName, server) {
            if (queuedUpdates[fileName]) {
                return;
            }
            log(`Queueing file update: ${fileName}`);
            const absoluteFilename = node_path_1.default.normalize(node_path_1.default.join(workingDirectory, fileName));
            const parsedPath = node_path_1.default.parse(absoluteFilename);
            const actualDirectoryInSymlink = fs.realpathSync(parsedPath.dir);
            const symlinkedFilename = node_path_1.default.join(actualDirectoryInSymlink, parsedPath.name + parsedPath.ext);
            const absoluteFilenameForwardSlash = absoluteFilename.replace(/\\/g, "/");
            const symlinkedFilenameForwardSlash = symlinkedFilename.replace(/\\/g, "/");
            const allPaths = [
                absoluteFilename,
                absoluteFilenameForwardSlash,
                symlinkedFilename,
                symlinkedFilenameForwardSlash,
            ];
            const updateAction = () => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c, _d, _e, _f;
                yield waitMillis(50);
                try {
                    const extractedVite = extractViteModuleFileParts(fileName);
                    const allViteIdModules = [...server.moduleGraph.idToModuleMap.values()];
                    let matchedModuleMap = new Map();
                    if (allViteIdModules.length > 0) {
                        for (const viteModule of allViteIdModules) {
                            const modulePaths = [
                                viteModule.file,
                                (_a = viteModule._clientModule) === null || _a === void 0 ? void 0 : _a.file,
                                (_b = viteModule._ssrModule) === null || _b === void 0 ? void 0 : _b.file,
                            ];
                            if (allPaths.some((p) => modulePaths.includes(p)) ||
                                (((_c = viteModule.file) === null || _c === void 0 ? void 0 : _c.includes(extractedVite.viteModulePart)) &&
                                    (((_d = viteModule.file) === null || _d === void 0 ? void 0 : _d.includes(extractedVite.viteFileName)) ||
                                        extractedVite.viteFileName === "index.js")) ||
                                node_path_1.default.normalize((_e = viteModule.file) !== null && _e !== void 0 ? _e : "") === absoluteFilename) {
                                matchedModuleMap.set((_f = viteModule.id) !== null && _f !== void 0 ? _f : "no-id", viteModule);
                            }
                        }
                        const matchedModules = [...matchedModuleMap.values()];
                        if ([...matchedModules.values()].length === 0) {
                            warn(`No matching Vite module found for: ${fileName}`);
                        }
                        else {
                            log(`Triggering file changes:\n-  ${matchedModules.map((m) => m.file).join("\n-  ")}`);
                        }
                        for (const viteModule of matchedModules) {
                            const filePath = viteModule.file;
                            yield server.reloadModule(viteModule);
                        }
                    }
                    else {
                        warn("No Module info yet from Vite");
                    }
                }
                catch (e) {
                    error(`Error while processing file change: ${fileName}`, e);
                }
                finally {
                    queuedUpdates[fileName] = undefined;
                }
            });
            queuedUpdates[fileName] = updateAction;
            updateAction();
        }
        const moduleFiles = yield (0, tinyglobby_1.glob)(matchModules.map((module) => `**/node_modules/${module}`), {
            cwd: options === null || options === void 0 ? void 0 : options.cwd,
        });
        const modulePaths = moduleFiles
            .filter((moduleFile) => {
            return moduleFile.endsWith("package.json");
        })
            .map((moduleFile) => {
            return node_path_1.default.normalize(moduleFile.slice(0, -13));
        });
        if (modulePaths.length === 0) {
            warn(`No node_modules found to watch for: "${matchModules.join(`", "`)}"`);
        }
        else {
            info(`Watching node_modules changes for:\n  -${modulePaths.join("\n  -")}`);
        }
        const handleFileUpdate = (changedPath) => {
            if (!changedPath.endsWith(".js")) {
                return;
            }
            queueUpdate(changedPath, server);
            log(`File changed: ${changedPath}`);
        };
        const nodeModuleWatcher = chokidar_1.default.watch(modulePaths, {
            cwd: options === null || options === void 0 ? void 0 : options.cwd,
            ignoreInitial: true,
        });
        nodeModuleWatcher
            .on("change", handleFileUpdate)
            .on("add", handleFileUpdate)
            .on("unlink", handleFileUpdate);
        (_a = server.httpServer) === null || _a === void 0 ? void 0 : _a.once("close", () => {
            nodeModuleWatcher.close();
        });
    }),
});
exports.watchNodeModules = watchNodeModules;
