const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
test('PDF uploads render and clean up using the installed PDF.js lifecycle API',()=>{
 const result=spawnSync(process.execPath,['--experimental-vm-modules','tests/helpers/pdf-upload.mjs'],{encoding:'utf8',timeout:20000});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/PDF upload, preview/);
});
