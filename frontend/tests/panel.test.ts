import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { Window } from 'happy-dom';
import type { Config, Hass, Snapshot } from '../src/types';
import { room, stateCondition } from '../src/model';

const browser = new Window({ url: 'http://localhost:8123' });
for (const key of ['window', 'document', 'customElements', 'HTMLElement', 'HTMLDetailsElement', 'Element', 'Node', 'Document', 'ShadowRoot', 'CSSStyleSheet', 'Event', 'CustomEvent', 'KeyboardEvent', 'FocusEvent'] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? browser : browser[key] });
}
const { HapoPanel } = await import('../src/hapo-panel');
type Panel = InstanceType<typeof HapoPanel>;
const fixture = (): Snapshot => ({ revision: 4, admin: true, names: { rooms: { office: 'My Office' }, residents: {}, modes: { active: '' } },
  config: { version: 1, failure_grace: 300, rooms: { office: { ...room('office','office'), name: 'My Office', entry: stateCondition('binary_sensor.motion') } }, residents: {}, home: { source: 'residents', entity: null, rooms: [], modes: [{ id: 'active', name: '', condition: { type: 'fact', key: 'occupied', value: true } }] } },
  runtime: { home: { mode: 'active', occupied: true, guests: false }, residents: {}, rooms: { office: { occupied: true, reason: 'presence_source', degraded: false, pending: false, latched: false, evidence: ['binary_sensor.motion'], next_deadline: null, override: null } }, next_deadline: null },
  catalog: { areas: [{ area_id: 'office', name: 'Office' }], entities: [{ entity_id: 'binary_sensor.motion', name: 'Mouvement', state: 'on', device_class: 'motion', area_id: 'office' }, { entity_id: 'binary_sensor.door', name: 'Porte', state: 'off', device_class: 'door', area_id: 'office' }] },
  suggestions: { office: [{ profile: 'bee', reason: 'motion_and_doors', entry: ['binary_sensor.motion'], hold: [], doors: ['binary_sensor.door'] }] } });
async function settle(p: Panel) { await new Promise(resolve => setTimeout(resolve, 15)); await p.updateComplete; }
async function mount(snapshot=fixture(), failSave=false) {
  const calls: Record<string,unknown>[] = []; let handler: (data: Snapshot) => void = () => {}; let unsubscribed=0;
  const hass: Hass = { locale: { language: 'fr-BE' }, states: {},
    async callWS<T>(message: Record<string,unknown>) { calls.push(structuredClone(message)); if (message.type==='hapo/save') { if (failSave) throw { code:'revision_conflict' }; snapshot={...snapshot,revision:snapshot.revision+1,config:structuredClone(message.config) as Config}; } return structuredClone(snapshot) as T; },
    connection: { async subscribeMessage(callback) { handler=callback; return () => { unsubscribed++; }; } } };
  const p = document.createElement('hapo-panel') as Panel; p.hass=hass; document.body.append(p); await settle(p);
  return { p,calls,emit: (data: Snapshot) => handler(data),unsubscribed: () => unsubscribed };
}
function button(p: Panel,label: string) { const b=[...p.shadowRoot!.querySelectorAll('button')].find(b=>b.textContent?.trim()===label); assert.ok(b,`Missing button: ${label}`); return b; }
function roomLink(p: Panel,name: string) { const b=[...p.shadowRoot!.querySelectorAll<HTMLButtonElement>('.room-rail .room-link')].find(b=>b.getAttribute('aria-label')===name); assert.ok(b,`Missing room: ${name}`); return b; }
function namedInput(p: Panel,label: string) { const l=[...p.shadowRoot!.querySelectorAll('label')].find(l=>l.textContent?.trim().startsWith(label)); const input=l?.querySelector('input'); assert.ok(input,`Missing input: ${label}`); return input; }
function namedSelect(p: Panel,label: string) { const l=[...p.shadowRoot!.querySelectorAll('label')].find(l=>l.textContent?.trim().startsWith(label)); const select=l?.querySelector('select'); assert.ok(select,`Missing select: ${label}`); return select; }
function enter(input: HTMLInputElement,value: string) { input.value=value; input.dispatchEvent(new Event('input',{bubbles:true})); }
async function openRoom(p: Panel,name='My Office',section='Présence') { roomLink(p,name).click(); await settle(p); if (section!=='Présence') { button(p,section).click(); await settle(p); } }
async function roomTab(p: Panel,label: string) { button(p,label).click(); await settle(p); }
function toggle(input: HTMLInputElement,value: boolean) { input.checked=value; input.dispatchEvent(new Event('change',{bubbles:true})); }
afterEach(()=>{document.body.replaceChildren();browser.sessionStorage.clear();});

test('administrator starts with the Halo navigation and an unselected room workspace',async()=>{
  const {p,calls}=await mount();
  assert.deepEqual([...p.shadowRoot!.querySelectorAll('.top-nav button')].map(b=>b.textContent?.trim()),['Pièces','Résidents','Réglages globaux']);
  assert.equal(button(p,'Pièces').getAttribute('aria-current'),'page');
  assert.equal(p.shadowRoot!.querySelector('.room-detail h2')!.textContent,'Choisis une pièce');
  assert.equal(roomLink(p,'My Office').getAttribute('aria-current'),null);
  assert.match(p.shadowRoot!.querySelector('.brand')!.getAttribute('title')!,/Home Assistant Presence Orchestrator/);
  assert.equal(p.draft,undefined); assert.equal(calls.filter(c=>c.type==='hapo/save').length,0);
});

test('localized panel preserves custom names and drafts across live updates and tabs',async()=>{
  const {p,emit}=await mount(); assert.match(p.shadowRoot!.textContent!,/My Office/);
  await openRoom(p,'My Office','Réglages'); enter(namedInput(p,'Nom'),'Bureau personnel'); await settle(p);
  const live=fixture(); live.runtime.rooms.office.occupied=false; emit(live); await settle(p);
  assert.equal(p.draft!.rooms.office.name,'Bureau personnel');
  assert.equal(p.shadowRoot!.querySelector('.room-summary .status')!.textContent,'Libre');
  button(p,'Réglages globaux').click(); await settle(p);
  assert.equal(p.shadowRoot!.querySelector('.home-mode')!.textContent,'Vie');
  button(p,'Pièces').click(); await settle(p); await openRoom(p,'Bureau personnel','Réglages');
  assert.equal(namedInput(p,'Nom').value,'Bureau personnel');
});
test('suggestions change only the draft after explicit selection',async()=>{
  const {p,calls}=await mount(); await openRoom(p,'My Office','Détection');
  assert.equal(p.draft,undefined); button(p,'Utiliser cette suggestion').click(); await settle(p);
  assert.equal(p.draft!.rooms.office.profile,'bee'); assert.equal(p.snapshot!.config!.rooms.office.profile,'motion');
  assert.equal(calls.filter(c=>c.type==='hapo/save').length,0);
  button(p,'Enregistrer').click(); await settle(p);
  assert.equal(calls.find(c=>c.type==='hapo/save')!.revision,4); assert.equal(p.draft,undefined);
});
test('concurrent changes preserve the draft and block overwriting a newer revision',async()=>{
  const {p,emit,calls}=await mount(); await openRoom(p,'My Office','Réglages'); enter(namedInput(p,'Nom'),'Draft'); await settle(p);
  emit({...fixture(),revision:5}); await settle(p);
  assert.equal(button(p,'Enregistrer').disabled,true); assert.equal(p.draft!.rooms.office.name,'Draft'); assert.equal(calls.filter(c=>c.type==='hapo/save').length,0);
});
test('server save rejection retains editable work',async()=>{
  const {p}=await mount(fixture(),true); await openRoom(p,'My Office','Réglages'); enter(namedInput(p,'Nom'),'Draft'); await settle(p); button(p,'Enregistrer').click(); await settle(p); assert.equal(p.draft!.rooms.office.name,'Draft'); assert.ok(p.shadowRoot!.querySelector('[role=alert]'));
});
test('read-only users do not receive configuration tabs and disconnect releases subscription',async()=>{
  const data=fixture(); data.admin=false; delete data.config; delete data.catalog;
  data.names.modes={active:'My custom mode'};
  const {p,unsubscribed}=await mount(data); assert.equal(p.shadowRoot!.querySelectorAll('.top-nav button').length,1); assert.equal(p.shadowRoot!.querySelector('.home-mode')!.textContent,'My custom mode'); p.remove(); assert.equal(unsubscribed(),1);
});
test('negative delay is blocked before saving',async()=>{
  const {p,calls}=await mount(); await openRoom(p,'My Office','Réglages'); enter(namedInput(p,'Nom'),'Draft'); await settle(p);
  await roomTab(p,'Délais'); enter(namedInput(p,'Confirmation de présence'),'-5'); button(p,'Enregistrer').click(); await settle(p);
  assert.equal(calls.filter(c=>c.type==='hapo/save').length,0); assert.ok(p.draft);
});

test('same-tab browser storage restores a draft after reopening the panel',async()=>{
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:browser.sessionStorage});
  const data=fixture(); data.instance_id='local-lab';
  const {p}=await mount(data); p.hass={...p.hass!,user:{id:'admin'}}; await settle(p);
  await openRoom(p,'My Office','Réglages'); enter(namedInput(p,'Nom'),'Saved draft'); await settle(p); p.remove();
  const fresh=document.createElement('hapo-panel') as Panel; fresh.hass={...p.hass!}; document.body.append(fresh); await settle(fresh);
  assert.equal(fresh.draft!.rooms.office.name,'Saved draft');
  button(fresh,'Abandonner').click(); await settle(fresh); assert.equal(sessionStorage.length,0);
});

test('saved area, profile and nested condition selections match configuration on first render',async()=>{
  const data=fixture(); data.config!.rooms.office.profile='bee'; data.config!.rooms.office.doors=[stateCondition('binary_sensor.door')];
  data.config!.rooms.office.entry={type:'or',conditions:[stateCondition('binary_sensor.motion')]};
  const {p}=await mount(data); await openRoom(p,'My Office','Réglages');
  assert.equal(namedSelect(p,'Zone Home Assistant').value,'office');
  await roomTab(p,'Détection'); assert.equal(namedSelect(p,'Profil de présence').value,'bee');
  const condition=p.shadowRoot!.querySelector('hapo-condition')!; assert.equal(condition.shadowRoot!.querySelector('select')!.value,'or');
});

function beeFixture() {
  const data=fixture(); data.config!.rooms.office.profile='bee'; data.config!.rooms.office.doors=[stateCondition('binary_sensor.door')];
  return data;
}

test('Bee opening controls are opt-in and save the recovery period separately for each room',async()=>{
  const data=beeFixture(); data.config!.rooms.garden={...room('garden'),name:'Garden',profile:'bee',entry:stateCondition('binary_sensor.motion'),doors:[stateCondition('binary_sensor.door')],require_opening:true,recovery_delay:45};
  const {p,calls}=await mount(data); await openRoom(p,'My Office','Délais');
  assert.equal(namedInput(p,'Exiger une ouverture avant une nouvelle présence').checked,false);
  assert.doesNotMatch(p.shadowRoot!.textContent!,/Délai de rattrapage après stabilisation \(secondes\)/);
  assert.equal(p.draft,undefined);
  toggle(namedInput(p,'Exiger une ouverture avant une nouvelle présence'),true); await settle(p);
  assert.equal(namedInput(p,'Délai de rattrapage après stabilisation').value,'120');
  enter(namedInput(p,'Délai de rattrapage après stabilisation'),'240'); await settle(p);
  button(p,'Enregistrer').click(); await settle(p);
  const saved=calls.find(c=>c.type==='hapo/save')!.config as Config;
  assert.equal(saved.rooms.office.require_opening,true); assert.equal(saved.rooms.office.recovery_delay,240);
  assert.equal(saved.rooms.garden.require_opening,true); assert.equal(saved.rooms.garden.recovery_delay,45);
  assert.equal(p.draft,undefined); assert.equal(namedInput(p,'Délai de rattrapage après stabilisation').value,'240');
});

test('Bee controls remain hidden on other profiles and retain the configured delay when disabled',async()=>{
  const {p}=await mount(); await openRoom(p,'My Office','Délais');
  assert.doesNotMatch(p.shadowRoot!.textContent!,/Exiger une ouverture avant une nouvelle présence/);
  await roomTab(p,'Détection'); button(p,'Utiliser cette suggestion').click(); await settle(p); await roomTab(p,'Délais');
  toggle(namedInput(p,'Exiger une ouverture avant une nouvelle présence'),true); await settle(p);
  enter(namedInput(p,'Délai de rattrapage après stabilisation'),'90'); await settle(p);
  toggle(namedInput(p,'Exiger une ouverture avant une nouvelle présence'),false); await settle(p);
  assert.doesNotMatch(p.shadowRoot!.textContent!,/Délai de rattrapage après stabilisation \(secondes\)/);
  assert.equal(p.draft!.rooms.office.recovery_delay,90);
  toggle(namedInput(p,'Exiger une ouverture avant une nouvelle présence'),true); await settle(p);
  assert.equal(namedInput(p,'Délai de rattrapage après stabilisation').value,'90');
  await roomTab(p,'Détection'); const profile=namedSelect(p,'Profil de présence'); profile.value='motion'; profile.dispatchEvent(new Event('change',{bubbles:true})); await settle(p); await roomTab(p,'Délais');
  assert.doesNotMatch(p.shadowRoot!.textContent!,/Exiger une ouverture avant une nouvelle présence/);
  assert.doesNotMatch(p.shadowRoot!.textContent!,/Délai de rattrapage après stabilisation \(secondes\)/);
});

test('older room snapshots keep the opening requirement disabled and supply 120 seconds on opt-in',async()=>{
  const data=beeFixture();
  delete (data.config!.rooms.office as Partial<Config['rooms'][string]>).require_opening;
  delete (data.config!.rooms.office as Partial<Config['rooms'][string]>).recovery_delay;
  const {p,calls}=await mount(data); await openRoom(p,'My Office','Délais');
  assert.equal(namedInput(p,'Exiger une ouverture avant une nouvelle présence').checked,false); assert.equal(p.draft,undefined);
  toggle(namedInput(p,'Exiger une ouverture avant une nouvelle présence'),true); await settle(p);
  assert.equal(namedInput(p,'Délai de rattrapage après stabilisation').value,'120');
  button(p,'Enregistrer').click(); await settle(p);
  const saved=calls.find(c=>c.type==='hapo/save')!.config as Config;
  assert.equal(saved.rooms.office.require_opening,true); assert.equal(saved.rooms.office.recovery_delay,120);
});

test('Bee recovery decisions and deadline are localized in the room details',async()=>{
  const data=beeFixture(); data.config!.rooms.office.require_opening=true;
  data.runtime.rooms.office={...data.runtime.rooms.office,occupied:false,reason:'waiting_for_opening'};
  const {p,emit}=await mount(data); await openRoom(p);
  assert.match(p.shadowRoot!.textContent!,/En attente d’une ouverture de porte/);
  const live=structuredClone(data); live.runtime.rooms.office.reason='entry_recovery'; live.runtime.rooms.office.recovery_until=1792584000; emit(live); await settle(p);
  assert.match(p.shadowRoot!.textContent!,/Rattrapage de présence possible/);
  assert.match(p.shadowRoot!.textContent!,/Nouvelles tentatives de confirmation possibles jusqu’à/);
  assert.ok(p.shadowRoot!.textContent!.includes(new Date(1792584000000).toLocaleTimeString('fr-BE')));
  p.hass={...p.hass!,locale:{language:'en'}}; await settle(p);
  assert.match(p.shadowRoot!.textContent!,/Entry recovery available/);
  assert.match(p.shadowRoot!.textContent!,/New confirmation attempts allowed until/);
  await roomTab(p,'Timing'); assert.equal(namedInput(p,'Recovery period after stabilization').value,'120');
});

test('Home Assistant menu visibility respects mobile, hidden sidebar and kiosk hosts',async()=>{
  const {p}=await mount();
  assert.equal(p.shadowRoot!.querySelector('.sidebar-toggle'),null);
  p.narrow=true; await settle(p);
  let menuEvent: CustomEvent | undefined;
  p.addEventListener('hass-toggle-menu',event=>{menuEvent=event as CustomEvent;});
  p.shadowRoot!.querySelector<HTMLButtonElement>('.sidebar-toggle')!.click();
  assert.deepEqual(menuEvent?.detail,{open:true}); assert.equal(menuEvent?.bubbles,true); assert.equal(menuEvent?.composed,true);
  p.narrow=false; p.hass={...p.hass!,dockedSidebar:'always_hidden'}; await settle(p);
  assert.ok(p.shadowRoot!.querySelector('.sidebar-toggle'));
  p.hass={...p.hass!,kioskMode:true}; await settle(p);
  assert.equal(p.shadowRoot!.querySelector('.sidebar-toggle'),null);
  p.hass={...p.hass!,kioskMode:false,auth:{external:{config:{hasSidebar:true}}}}; await settle(p);
  assert.equal(p.shadowRoot!.querySelector('.sidebar-toggle'),null);
  p.hass={...p.hass!,auth:{external:{config:{hasSidebar:false}}}}; await settle(p);
  assert.ok(p.shadowRoot!.querySelector('.sidebar-toggle'));
});

test('room tabs support arrow wrapping, Home and End with synchronized focus and tabpanel labels',async()=>{
  const {p}=await mount(); await openRoom(p);
  const tabs=[...p.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  assert.deepEqual(tabs.map(t=>t.textContent?.trim()),['Présence','Détection','Délais','Contexte','Réglages']);
  assert.equal(p.shadowRoot!.querySelectorAll('[role=tablist]').length,1);
  async function key(key: string,expected: string) {
    const selected=p.shadowRoot!.querySelector<HTMLButtonElement>('[role=tab][aria-selected=true]')!;
    selected.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})); await settle(p);
    const active=button(p,expected);
    assert.equal(active.getAttribute('aria-selected'),'true'); assert.equal(active.getAttribute('tabindex'),'0');
    assert.equal(p.shadowRoot!.querySelectorAll('[role=tab][tabindex="0"]').length,1);
    assert.equal(p.shadowRoot!.querySelector('[role=tabpanel]')!.getAttribute('aria-labelledby'),active.id);
    assert.equal(p.shadowRoot!.activeElement,active);
  }
  await key('ArrowLeft','Réglages'); await key('ArrowRight','Présence');
  await key('ArrowRight','Détection'); await key('End','Réglages'); await key('Home','Présence');
});

test('invalid room fields block tab, room and global navigation without losing the invalid value',async()=>{
  const data=fixture(); data.catalog!.areas.push({area_id:'garden',name:'Garden'});
  const {p,calls}=await mount(data); await openRoom(p,'My Office','Délais');
  enter(namedInput(p,'Confirmation de présence'),'5'); await settle(p);
  enter(namedInput(p,'Confirmation de présence'),'-1');
  await roomTab(p,'Réglages');
  assert.equal(button(p,'Délais').getAttribute('aria-selected'),'true');
  assert.equal(namedInput(p,'Confirmation de présence').value,'-1');
  button(p,'Délais').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true})); await settle(p);
  assert.equal(button(p,'Délais').getAttribute('aria-selected'),'true');
  roomLink(p,'Garden').click(); await settle(p);
  assert.equal(roomLink(p,'My Office').getAttribute('aria-current'),'page');
  button(p,'Réglages globaux').click(); await settle(p);
  assert.equal(button(p,'Pièces').getAttribute('aria-current'),'page');
  assert.ok(p.shadowRoot!.querySelector('[role=alert]'));
  assert.equal(calls.filter(c=>c.type==='hapo/save').length,0); assert.equal(p.draft!.rooms.office.on_delay,5);
  enter(namedInput(p,'Confirmation de présence'),'10'); await settle(p); await roomTab(p,'Réglages');
  assert.equal(button(p,'Réglages').getAttribute('aria-selected'),'true');
});

test('unconfigured Home Assistant areas require explicit setup and only create a draft',async()=>{
  const data=fixture(); data.catalog!.areas.push({area_id:'garden',name:'Garden'});
  const {p,calls}=await mount(data);
  assert.match(roomLink(p,'Garden').textContent!,/Non configurée/);
  assert.equal(p.shadowRoot!.querySelectorAll('.room-link').length,2);
  await openRoom(p,'Garden');
  assert.equal(p.draft,undefined); assert.equal(p.shadowRoot!.querySelector('[role=tablist]'),null);
  button(p,'Configurer').click(); await settle(p);
  const created=Object.values(p.draft!.rooms).find(r=>r.area_id==='garden');
  assert.ok(created); assert.equal(created.recovery_delay,120); assert.equal(created.require_opening,false);
  assert.equal(button(p,'Détection').getAttribute('aria-selected'),'true');
  assert.equal(button(p,'Forcer présent').disabled,true); assert.equal(button(p,'Forcer absent').disabled,true);
  assert.equal(Object.values(p.snapshot!.config!.rooms).some(r=>r.area_id==='garden'),false);
  assert.equal(p.shadowRoot!.querySelectorAll('.room-link').length,2);
  assert.equal(calls.filter(c=>c.type==='hapo/save'||c.type==='hapo/command').length,0);
  button(p,'Abandonner').click(); await settle(p);
  assert.equal(p.draft,undefined); assert.match(roomLink(p,'Garden').textContent!,/Non configurée/);
});

test('adding a room starts with identity so its area can supply detection suggestions',async()=>{
  const data=fixture(); data.catalog!.areas.push({area_id:'garden',name:'Garden'});
  data.suggestions!.garden=structuredClone(data.suggestions!.office);
  const {p,calls}=await mount(data);
  button(p,'Ajouter une pièce').click(); await settle(p);
  assert.equal(button(p,'Réglages').getAttribute('aria-selected'),'true');
  const created=Object.values(p.draft!.rooms).find(r=>r.id!=='office');
  assert.ok(created); assert.equal(created.area_id,null); assert.equal(created.entry,null);
  enter(namedInput(p,'Nom'),'Mon jardin'); await settle(p);
  const area=namedSelect(p,'Zone Home Assistant'); area.value='garden'; area.dispatchEvent(new Event('change',{bubbles:true})); await settle(p);
  await roomTab(p,'Détection');
  assert.equal(button(p,'Détection').getAttribute('aria-selected'),'true');
  assert.equal(p.shadowRoot!.querySelector('[role=alert]'),null);
  button(p,'Utiliser cette suggestion').click(); await settle(p);
  assert.equal(p.draft!.rooms[created.id].name,'Mon jardin'); assert.equal(p.draft!.rooms[created.id].area_id,'garden');
  assert.equal(p.draft!.rooms[created.id].profile,'bee');
  assert.deepEqual(p.draft!.rooms[created.id].entry,stateCondition('binary_sensor.motion'));
  assert.deepEqual(p.draft!.rooms[created.id].doors,[stateCondition('binary_sensor.door')]);
  await roomTab(p,'Réglages');
  assert.equal(namedInput(p,'Nom').value,'Mon jardin'); assert.equal(namedSelect(p,'Zone Home Assistant').value,'garden');
  assert.equal(p.snapshot!.config!.rooms[created.id],undefined);
  assert.equal(calls.filter(c=>c.type==='hapo/save'||c.type==='hapo/command').length,0);
});

test('presence sources and decision evidence stay tied to the saved configuration while editing detection',async()=>{
  const data=fixture();
  data.catalog!.entities.push({entity_id:'binary_sensor.draft_motion',name:'Mouvement du brouillon',state:'off',device_class:'motion',area_id:'office'});
  const {p,calls}=await mount(data); await openRoom(p,'My Office','Détection');
  const condition=p.shadowRoot!.querySelector('hapo-condition')!;
  const picker=condition.shadowRoot!.querySelector('hapo-entity-picker')!;
  const input=picker.shadowRoot!.querySelector<HTMLInputElement>('input')!;
  input.focus(); enter(input,'binary_sensor.draft_motion'); await settle(p);
  picker.shadowRoot!.querySelector<HTMLElement>('[role=option]')!.click(); await settle(p);
  assert.equal(p.draft!.rooms.office.entry!.entity_id,'binary_sensor.draft_motion');
  assert.equal(p.snapshot!.config!.rooms.office.entry!.entity_id,'binary_sensor.motion');
  await roomTab(p,'Présence');
  const sources=p.shadowRoot!.querySelector('.source-list')!;
  assert.deepEqual([...sources.querySelectorAll('small')].map(element=>element.textContent),['binary_sensor.motion']);
  assert.doesNotMatch(sources.textContent!,/Mouvement du brouillon/);
  const evidence=[...p.shadowRoot!.querySelectorAll('details')].find(details=>details.querySelector('summary')?.textContent==='Sources actives');
  assert.ok(evidence); evidence.querySelector('summary')!.click(); await settle(p);
  assert.equal(evidence.open,true); assert.equal(evidence.querySelector('p')!.textContent,'Mouvement');
  assert.equal(p.draft!.rooms.office.entry!.entity_id,'binary_sensor.draft_motion');
  assert.equal(calls.filter(c=>c.type==='hapo/save').length,0);
});

test('presence controls use the chosen override duration without saving room configuration',async()=>{
  const data=fixture(); data.runtime.rooms.office.override={occupied:true,until:null};
  const {p,calls}=await mount(data); await openRoom(p);
  enter(namedInput(p,'Durée du forçage'),'17'); await settle(p);
  button(p,'Forcer présent').click(); await settle(p);
  await roomTab(p,'Délais'); await roomTab(p,'Présence');
  assert.equal(namedInput(p,'Durée du forçage').value,'17');
  button(p,'Forcer absent').click(); await settle(p);
  enter(namedInput(p,'Durée du forçage'),'0'); await settle(p);
  button(p,'Forcer présent').click(); await settle(p);
  button(p,'Reprendre automatiquement').click(); await settle(p);
  assert.deepEqual(calls.filter(c=>c.type==='hapo/command'),[
    {type:'hapo/command',command:'room_override',target:'office',value:'occupied',duration:1020},
    {type:'hapo/command',command:'room_override',target:'office',value:'clear',duration:1020},
    {type:'hapo/command',command:'room_override',target:'office',value:'occupied',duration:0},
    {type:'hapo/command',command:'room_override',target:'office',value:'auto',duration:0},
  ]);
  assert.equal(p.draft,undefined); assert.equal(calls.filter(c=>c.type==='hapo/save').length,0);
});
