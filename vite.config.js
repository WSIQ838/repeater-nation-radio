import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const pkg=JSON.parse(readFileSync(new URL("./package.json",import.meta.url),"utf8"));
export default defineConfig({plugins:[react()],define:{__APP_VERSION__:JSON.stringify(pkg.version)},clearScreen:false,build:{target:["es2022","chrome105","safari15"],chunkSizeWarningLimit:700},server:{port:1420,strictPort:true,watch:{ignored:["**/src-tauri/**"]}}});
