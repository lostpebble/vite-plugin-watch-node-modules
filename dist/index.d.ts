import { type Plugin } from "vite";
interface IWatchNodeModulesChangesOptions {
    cwd?: string;
}
export declare const watchNodeModules: (matchModules: string[], options?: IWatchNodeModulesChangesOptions) => Plugin;
export {};
