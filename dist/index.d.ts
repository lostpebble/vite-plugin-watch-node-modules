import { type Plugin } from "vite";
interface IWatchNodeModulesChangesOptions {
    cwd?: string;
}
export declare const watchNodeModule: (matchModules: string[], options?: IWatchNodeModulesChangesOptions) => Plugin;
export {};
