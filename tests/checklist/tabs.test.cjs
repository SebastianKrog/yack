const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(path='/'){
 const entries=[path],listeners=new Map(),open=new Set();let index=0,url=new URL(path,'https://site.test');
 const window={get location(){return url;},history:{pushState(state,title,path){entries.splice(++index);entries.push(path);url=new URL(path,url);}},addEventListener(name,fn){listeners.set(name,fn);}};
 vm.runInNewContext(fs.readFileSync('public/tabs.js','utf8'),{window});const tabs=window.MorningTabs;
 for(const name of ['editor','trophies','profile'])tabs.register(name,{isOpen:()=>open.has(name),open:()=>open.add(name),close:()=>open.delete(name)});
 tabs.start();return {tabs,open,entries,path:()=>url.pathname,step(delta){index+=delta;url=new URL(entries[index],url);listeners.get('popstate')();}};
}
test('tab changes update paths without duplicate entries and selected tabs toggle back to the checklist',()=>{
 const f=fixture();f.tabs.toggle('editor');assert.equal(f.path(),'/edit');assert.deepEqual([...f.open],['editor']);f.tabs.show('editor');assert.equal(f.entries.length,2);
 f.tabs.toggle('trophies');assert.equal(f.path(),'/trophies');assert.deepEqual([...f.open],['trophies']);f.tabs.toggle('profile');assert.equal(f.path(),'/profile');assert.deepEqual([...f.open],['profile']);
 f.tabs.toggle('profile');assert.equal(f.path(),'/');assert.equal(f.open.size,0);
});
test('direct paths restore the right view after registration, including trailing slashes',()=>{
 for(const [path,name] of [['/edit','editor'],['/trophies','trophies'],['/profile','profile'],['/profile/','profile']]){const f=fixture(path);assert.deepEqual([...f.open],[name]);assert.equal(f.entries.length,1);}
});
test('Back and Forward restore views without adding history entries or changing task data',()=>{
 const f=fixture();for(const name of ['editor','trophies','profile'])f.tabs.show(name);const count=f.entries.length;
 f.step(-1);assert.deepEqual([...f.open],['trophies']);f.step(-1);assert.deepEqual([...f.open],['editor']);f.step(-1);assert.equal(f.open.size,0);f.step(1);assert.deepEqual([...f.open],['editor']);assert.equal(f.entries.length,count);
});
test('close actions return home while closing an inactive view leaves the selected route alone',()=>{
 const f=fixture('/edit?test=1#section');f.tabs.close('profile');assert.equal(f.path(),'/edit');f.tabs.close('editor');assert.equal(f.path(),'/');assert.equal(f.entries[1],'/?test=1#section');
});
test('a queued dialog close event cannot reset a reopened editor or hide routed trophies',()=>{
 const {appFixture}=require('../helpers/dom.cjs'),f=appFixture(),dialog=f.get('#editor');
 dialog.close=()=>{dialog.open=false;};
 f.get('#edit').fire('click');f.get('#crown').fire('click');assert.equal(f.get('#edit').getAttribute('aria-pressed'),'false');assert.equal(f.get('#achievements-view').hidden,false);
 f.get('#edit').fire('click');dialog.fire('close');assert.equal(f.get('#edit').getAttribute('aria-pressed'),'true');assert(dialog.open);assert.equal(f.get('#crown').getAttribute('aria-pressed'),'false');
});

test('Escape leaves an editor underneath a modal open for the native dialog cancel',()=>{
 const {appFixture}=require('../helpers/dom.cjs'),f=appFixture();f.get('#edit').fire('click');
 const viewer=f.doc.createElement('dialog');f.doc.body.append(viewer);viewer.showModal();
 const key=f.doc.root.fire('keydown',{key:'Escape'});assert(!key.defaultPrevented);assert(f.get('#editor').open);assert(viewer.open);
 viewer.close();f.doc.root.fire('keydown',{key:'Escape'});assert(!f.get('#editor').open);
});

test('editing is nonmodal and the top menu switches directly between editing and trophies',()=>{
 const {appFixture}=require('../helpers/dom.cjs');const f=appFixture();f.get('#edit').fire('click');
 assert(f.get('#editor').open);assert.equal(f.get('#editor').modal,false);assert.equal(f.get('#edit').getAttribute('aria-pressed'),'true');
 const input=f.get('#editor-list').children[0].querySelector('.edit-text');input.value='Saved while switching tabs';input.fire('input');
 f.get('#crown').fire('pointerenter');assert.equal(f.get('#crown').getAttribute('aria-pressed'),'false');
 f.get('#crown').fire('click');assert(!f.get('#editor').open);assert.equal(f.get('#crown').getAttribute('aria-pressed'),'true');assert(!f.get('#achievements-view').hidden);
 f.get('#edit').fire('click');assert(f.get('#editor').open);assert.equal(f.get('#crown').getAttribute('aria-pressed'),'false');
 assert.equal(f.get('#editor-list').children[0].querySelector('.edit-text').value,'Saved while switching tabs');
 f.get('#edit').fire('click');assert(!f.get('#editor').open);assert(!f.get('#tasks-view').hidden);
});
