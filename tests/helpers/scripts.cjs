// Reuse compilation, never globals: every execution still gets a fresh VM context.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const projectRoot=path.resolve(__dirname,'../..');
const scripts=new Map();
function script(name){
 if(!scripts.has(name))scripts.set(name,new vm.Script(fs.readFileSync(path.join(projectRoot,'public',name+'.js'),'utf8'),{filename:name+'.js'}));
 return scripts.get(name);
}
module.exports={script,projectRoot};
