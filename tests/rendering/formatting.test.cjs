const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../../public/formatting.js');
test('italic, bold and underline use only the requested markers',()=>{
 assert.deepEqual(F.parse('*kaffe* **plan** _pause_'),[
  {type:'em',children:[{type:'text',text:'kaffe'}]}, {type:'text',text:' '},
  {type:'strong',children:[{type:'text',text:'plan'}]}, {type:'text',text:' '},
  {type:'u',children:[{type:'text',text:'pause'}]}
 ]);
});
test('triple stars and nested combinations preserve all selected formatting',()=>{
 assert.deepEqual(F.parse('***kaffe***'),[{type:'strong',children:[{type:'em',children:[{type:'text',text:'kaffe'}]}]}]);
 assert.deepEqual(F.parse('_**plan**_'),[{type:'u',children:[{type:'strong',children:[{type:'text',text:'plan'}]}]}]);
 assert.deepEqual(F.parse('_***pause***_'),[{type:'u',children:[{type:'strong',children:[{type:'em',children:[{type:'text',text:'pause'}]}]}]}]);
 assert.equal(F.plain('**Planlæg *en god* _pause_**'),'Planlæg en god pause');
});
test('unmatched markers, whitespace-only pairs and intraword underscores stay literal',()=>{
 for(const text of ['Hent *kaffe','**plan*','* kaffe *','_ _','fil_navn.pdf','__pause__','****pause****'])
  assert.equal(F.plain(text),text);
});
test('links, headings, code and HTML remain ordinary text',()=>{
 for(const text of ['# Plan','[plan](https://example.com)','`plan`','<img src=x onerror=alert(1)>'])
  assert.deepEqual(F.parse(text),[{type:'text',text}]);
});
test('rendering builds text nodes and permitted formatting elements without parsing HTML',()=>{
 const doc={createTextNode:text=>({text}),createElement:tag=>({tag,children:[],append(...nodes){this.children.push(...nodes);}})};
 const el={ownerDocument:doc,dataset:{},replaceChildren(...nodes){this.children=nodes;}};
 const source='**<script>alert(1)</script>** _pause_';F.render(el,source);
 assert.equal(el.dataset.source,source);
 assert.equal(el.children[0].tag,'strong');assert.equal(el.children[0].children[0].text,'<script>alert(1)</script>');
 assert.equal(el.children[2].tag,'u');
});
test('strike geometry merges formatted fragments and keeps wrapped lines separate',()=>{
 const rect=(left,top,width,height=30)=>({left,top,width,height,right:left+width,bottom:top+height});
 assert.deepEqual(F.lines([rect(0,0,40),rect(40,1,30,28),rect(40,1,30,28),rect(70,0,20),rect(0,40,50),rect(50,40,15),rect(0,0,0)]),[
  rect(0,0,90),rect(0,40,65)
 ]);
});
