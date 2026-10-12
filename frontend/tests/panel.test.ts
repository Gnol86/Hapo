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
function namedInput(p: Panel,label: string) { const l=[...p.shadowRoot!.querySelectorAll('label')].find(l=>l.textContent?.trim().startsWith(label)); const input=l?.querySelector('input'); assert.ok(input,`Missing input: ${label}`); return input; }
function enter(input: HTMLInputElement,value: string) { input.value=value; input.dispatchEvent(new Event('input',{bubbles:true})); }
afterEach(()=>{document.body.replaceChildren();});

test('localized panel preserves custom names and drafts across live updates and tabs',async()=>{
  const {p,emit}=await mount(); assert.match(p.shadowRoot!.textContent!,/Vue d’ensemble/); assert.match(p.shadowRoot!.textContent!,/My Office/);
  assert.equal(p.shadowRoot!.querySelector('.home-mode')!.textContent,'Vie');
  button(p,'My Office').click(); await settle(p); enter(namedInput(p,'Nom'),'Bureau personnel'); await settle(p);
  const live=fixture(); live.runtime.rooms.office.occupied=false; emit(live); await settle(p);
  assert.equal(p.draft!.rooms.office.name,'Bureau personnel');
  button(p,'Maison').click(); await settle(p); button(p,'Pièces').click(); await settle(p); [...p.shadowRoot!.querySelectorAll<HTMLButtonElement>('.sidebar button')].find(b=>b.textContent?.includes('Bureau personnel'))!.click(); await settle(p);
  assert.equal(namedInput(p,'Nom').value,'Bureau personnel');
});
test('suggestions change only the draft after explicit selection',async()=>{
  const {p,calls}=await mount(); button(p,'My Office').click(); await settle(p);
  assert.equal(p.draft,undefined); button(p,'Utiliser cette suggestion').click(); await settle(p);
  assert.equal(p.draft!.rooms.office.profile,'bee'); assert.equal(p.snapshot!.config!.rooms.office.profile,'motion');
  assert.equal(calls.filter(c=>c.type==='hapo/save').length,0);
  button(p,'Enregistrer').click(); await settle(p);
  assert.equal(calls.find(c=>c.type==='hapo/save')!.revision,4); assert.equal(p.draft,undefined);
});
test('concurrent changes preserve the draft and block overwriting a newer revision',async()=>{
  const {p,emit,calls}=await mount(); button(p,'My Office').click(); await settle(p); enter(namedInput(p,'Nom'),'Draft'); await settle(p);
  emit({...fixture(),revision:5}); await settle(p);
  assert.equal(button(p,'Enregistrer').disabled,true); assert.equal(p.draft!.rooms.office.name,'Draft'); assert.equal(calls.filter(c=>c.type==='hapo/save').length,0);
});
test('server save rejection retains editable work',async()=>{
  const {p}=await mount(fixture(),true); button(p,'My Office').click(); await settle(p); enter(namedInput(p,'Nom'),'Draft'); await settle(p); button(p,'Enregistrer').click(); await settle(p); assert.equal(p.draft!.rooms.office.name,'Draft'); assert.ok(p.shadowRoot!.querySelector('[role=alert]'));
});
test('read-only users do not receive configuration tabs and disconnect releases subscription',async()=>{
  const data=fixture(); data.admin=false; delete data.config; delete data.catalog;
  data.names.modes={active:'My custom mode'};
  const {p,unsubscribed}=await mount(data); assert.equal(p.shadowRoot!.querySelectorAll('nav button').length,1); assert.equal(p.shadowRoot!.querySelector('.home-mode')!.textContent,'My custom mode'); p.remove(); assert.equal(unsubscribed(),1);
});
test('negative delay is blocked before saving',async()=>{
  const {p,calls}=await mount(); button(p,'My Office').click(); await settle(p); enter(namedInput(p,'Nom'),'Draft'); await settle(p);
  const numeric=p.shadowRoot!.querySelector<HTMLInputElement>('input[type=number]')!; enter(numeric,'-5'); button(p,'Enregistrer').click(); await settle(p);
  assert.equal(calls.filter(c=>c.type==='hapo/save').length,0); assert.ok(p.draft);
});

test('same-tab browser storage restores a draft after reopening the panel',async()=>{
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:browser.sessionStorage});
  const data=fixture(); data.instance_id='local-lab';
  const {p}=await mount(data); p.hass={...p.hass!,user:{id:'admin'}}; await settle(p);
  button(p,'My Office').click(); await settle(p); enter(namedInput(p,'Nom'),'Saved draft'); await settle(p); p.remove();
  const fresh=document.createElement('hapo-panel') as Panel; fresh.hass={...p.hass!}; document.body.append(fresh); await settle(fresh);
  assert.equal(fresh.draft!.rooms.office.name,'Saved draft');
  button(fresh,'Abandonner').click(); await settle(fresh); assert.equal(sessionStorage.length,0);
});

test('saved area, profile and nested condition selections match configuration on first render',async()=>{
  const data=fixture(); data.config!.rooms.office.profile='bee'; data.config!.rooms.office.doors=[stateCondition('binary_sensor.door')];
  data.config!.rooms.office.entry={type:'or',conditions:[stateCondition('binary_sensor.motion')]};
  const {p}=await mount(data); button(p,'My Office').click(); await settle(p);
  const selects=[...p.shadowRoot!.querySelectorAll('select')]; assert.equal(selects[0].value,'office'); assert.equal(selects[1].value,'bee');
  const condition=p.shadowRoot!.querySelector('hapo-condition')!; assert.equal(condition.shadowRoot!.querySelector('select')!.value,'or');
});
