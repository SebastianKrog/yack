const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
// Structural CSS check: browsers recover from unclosed blocks by silently
// putting subsequent styles in the wrong media query, rather than reporting it.
function blocks(css){
 const result=[],stack=[];let start=0,quote=null,comment=false;
 for(let i=0;i<css.length;i++){
  const c=css[i];
  if(comment){if(c==='*'&&css[i+1]==='/'){comment=false;i++;}continue;}
  if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}
  if(c==='/'&&css[i+1]==='*'){comment=true;i++;continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c==='{'){
   const prelude=css.slice(start,i).replace(/\/\*[\s\S]*?\*\//g,'').trim();
   stack.push({prelude,at:i+1,parents:stack.map(b=>b.prelude)});start=i+1;
  }else if(c==='}'){
   assert(stack.length,'Unexpected closing CSS brace');
   const block=stack.pop();result.push({...block,body:css.slice(block.at,i)});start=i+1;
  }else if(c===';')start=i+1;
 }
 assert.equal(stack.length,0,'Unclosed CSS block');assert(!quote&&!comment,'Unclosed CSS string/comment');return result;
}
test('trophy rendering styles are valid and available outside reduced-motion media rules',()=>{
 const rules=blocks(fs.readFileSync('public/style.css','utf8'));
 for(const selector of ['.trophy-art','.trophy-metal','.trophy-reflection','.reflection-fill','.reflection-edge','[data-tier="silver"]','[data-tier="gold"]']){
  assert(rules.some(r=>r.prelude===selector&&r.parents.length===0),`${selector} must apply in normal motion mode`);
 }
 const reflection=rules.find(r=>r.prelude==='.reflection-fill'&&!r.parents.length);
 assert.match(reflection.body,/fill:\s*#fff\b/);
 const positioning=rules.find(r=>r.prelude==='.trophy-reflection'&&!r.parents.length);
 assert.match(positioning.body,/position:\s*absolute/);
 const gold=rules.find(r=>r.prelude==='#achievement-toast[data-tier="gold"]'&&!r.parents.length);
 assert(gold,'Gold popup positioning must apply outside media queries');assert.match(gold.body,/inset:0/);assert.match(gold.body,/margin:auto/);assert.match(gold.body,/height:fit-content/);
});
test('metal and glare are driven by shared CSS animation with translucent constant-width reflections',()=>{
 const css=fs.readFileSync('public/style.css','utf8'),rules=blocks(css);
 assert(rules.some(r=>r.prelude==='@property --metal-phase'));
 const root=rules.find(r=>r.prelude===':root'&&/metal-clock/.test(r.body));assert(root);
 assert.match(root.body,/animation:metal-clock 12000ms linear infinite/);
 const fill=rules.find(r=>r.prelude==='.reflection-fill');assert.match(fill.body,/fill-opacity:\.7/);
 const edge=rules.find(r=>r.prelude==='.reflection-edge');assert.match(edge.body,/vector-effect:non-scaling-stroke/);
 for(const r of rules.filter(r=>r.prelude==='.trophy-metal'||r.prelude==='.achievement-toast-card::before'))assert(!/animation:/.test(r.body),'Metal surfaces must inherit a single shared phase');
 assert(!/animation-delay:-/.test(css),'Individual metal or shine offsets must not desynchronize the shared gradient');
});

test('gold trophy wiggle animates its mask and drawing while the metal surface stays stationary',()=>{
 const rules=blocks(fs.readFileSync('public/style.css','utf8'));
 const motion=rules.find(r=>r.prelude.includes('.launching .trophy-geometry')&&!r.parents.length);
 assert(motion);assert(motion.prelude.includes('.trophy-mask-motion'));assert.match(motion.body,/animation:gold-trophy-wiggle/);
 const metal=rules.filter(r=>r.prelude.endsWith('.trophy-metal'));
 assert(metal.every(r=>!/(?:animation|transform):/.test(r.body)));
});
