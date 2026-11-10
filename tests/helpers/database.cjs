const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const path=require('node:path');
const {afterEach}=require('node:test');
const {projectRoot}=require('./scripts.cjs');
const directory=path.join(projectRoot,'drizzle');
const migrations=fs.readdirSync(directory).filter(file=>file.endsWith('.sql')).sort().map(file=>fs.readFileSync(path.join(directory,file),'utf8'));
const connections=new Set();
afterEach(()=>{for(const sql of connections)sql.close();connections.clear();});
function database(){
 const sql=new DatabaseSync(':memory:');connections.add(sql);for(const migration of migrations)sql.exec(migration);
 const statements=new Map();
 const prepare=query=>{if(!statements.has(query))statements.set(query,sql.prepare(query));return statements.get(query);};
 const db={prepare(query){return {bind(...args){const statement=prepare(query);return {all:async()=>({results:statement.all(...args)}),first:async()=>statement.get(...args),run:async()=>statement.run(...args)};}};},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};return db;
}
module.exports={database};
