import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const pkg=JSON.parse(readFileSync(new URL("./package.json",import.meta.url),"utf8"));
export default defineConfig({plugins:[react()],define:{__APP_VERSION__:JSON.stringify(pkg.version),__MOBILE__:JSON.stringify(["android","ios"].includes(process.env.TAURI_ENV_PLATFORM))},clearScreen:false,build:{target:["es2022","chrome105","safari15"],chunkSizeWarningLimit:700},server:{port:1420,strictPort:true,host:process.env.TAURI_DEV_HOST||false,watch:{ignored:["**/src-tauri/**"]}}});
