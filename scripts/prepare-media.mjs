import { cp, mkdir } from 'node:fs/promises';
const source=new URL('../node_modules/pdfjs-dist/',import.meta.url),target=new URL('../public/vendor/pdfjs/',import.meta.url);
await mkdir(target,{recursive:true});
for(const [from,to] of [['build/pdf.min.mjs','pdf.mjs'],['build/pdf.worker.min.mjs','pdf.worker.mjs'],['cmaps','cmaps'],['standard_fonts','standard_fonts'],['wasm','wasm'],['LICENSE','LICENSE']])await cp(new URL(from,source),new URL(to,target),{recursive:true});
