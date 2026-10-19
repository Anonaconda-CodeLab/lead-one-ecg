/* ---------- Android app (Capacitor) ----------
   In the Android app the page runs inside Android's WebView, which lacks Web Bluetooth, file downloads, printing,
   vibration and screen wake locks. This file supplies native stand-ins so the rest of the app runs unchanged.
   In a browser NATIVE is false and nothing here is used. All calls stay on the phone: the app has no internet permission. */
const NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
const nativeCall = (plugin, method, opts) => window.Capacitor.nativePromise(plugin, method, opts || {});
const nativeOn = (plugin, event, cb) => window.Capacitor.addListener(plugin, event, cb);
const LeadOneNative = NATIVE ? {
  saveFile: (name, text, mime) => nativeCall('LeadOne', 'saveFile', { name, text, mime: mime || 'application/json' }),
  print: name => nativeCall('LeadOne', 'print', { name }),
  keepScreenOn: on => nativeCall('LeadOne', 'keepScreenOn', { on: !!on }).catch(() => {}),
  vibrate: pattern => nativeCall('LeadOne', 'vibrate', { pattern }).catch(() => {}),
  recording: (on, text) => nativeCall('LeadOne', on ? 'startRecording' : 'stopRecording', { text: text || '' }).catch(() => {})
} : null;

if (NATIVE) (() => {
  document.documentElement.classList.add('native');   // hides browser-only guidance (see style.css)
  // Web Bluetooth subset used by app.js, implemented on @capacitor-community/bluetooth-le
  const BLE = 'BluetoothLe';
  const STD = { heart_rate: 0x180d, battery_service: 0x180f, device_information: 0x180a,
    heart_rate_measurement: 0x2a37, battery_level: 0x2a19, firmware_revision_string: 0x2a26 };
  const uuid = u => typeof u === 'number' ? `0000${u.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`
    : STD[u] != null ? uuid(STD[u]) : String(u).toLowerCase();
  const hexToView = h => { const m = String(h || '').replace(/[^0-9a-f]/gi, '').match(/../g) || []; return new DataView(Uint8Array.from(m, x => parseInt(x, 16)).buffer); };
  const toHex = v => { const u = v instanceof DataView ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength); return Array.from(u, x => x.toString(16).padStart(2, '0')).join(''); };
  const domErr = (name, message) => { const e = new Error(message); e.name = name; return e; };
  let ready = null;
  const init = () => ready = ready || (async () => {
    await nativeCall(BLE, 'initialize', { androidNeverForLocation: true });
    const on = await nativeCall(BLE, 'isEnabled');
    if (!on || !on.value) await nativeCall(BLE, 'requestEnable').catch(() => {});
  })().catch(e => { ready = null; throw e; });

  class Emitter {
    constructor() { this._l = {}; }
    addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
    removeEventListener(t, f) { this._l[t] = (this._l[t] || []).filter(x => x !== f); }
    _emit(t, e) { for (const f of (this._l[t] || []).slice()) { try { f(e); } catch (err) { console.error(err); } } }
  }
  class Characteristic extends Emitter {
    constructor(dev, service, id) { super(); this.dev = dev; this.service = service; this.uuid = id; this.value = null; }
    async startNotifications() {
      const sub = nativeOn(BLE, `notification|${this.dev.id}|${this.service}|${this.uuid}`, ev => {
        this.value = hexToView(ev && ev.value); this._emit('characteristicvaluechanged', { target: this });
      });
      this.dev._subs.push(sub);
      await nativeCall(BLE, 'startNotifications', { deviceId: this.dev.id, service: this.service, characteristic: this.uuid });
      return this;
    }
    async readValue() {
      const r = await nativeCall(BLE, 'read', { deviceId: this.dev.id, service: this.service, characteristic: this.uuid });
      return this.value = hexToView(r && r.value);
    }
    async writeValueWithResponse(v) { await nativeCall(BLE, 'write', { deviceId: this.dev.id, service: this.service, characteristic: this.uuid, value: toHex(v) }); }
    writeValue(v) { return this.writeValueWithResponse(v); }
  }
  class Service {
    constructor(dev, s) { this.dev = dev; this.uuid = s.uuid.toLowerCase(); this._chars = (s.characteristics || []).map(c => String(c.uuid).toLowerCase()); }
    async getCharacteristic(c) {
      const id = uuid(c);
      if (!this._chars.includes(id)) throw domErr('NotFoundError', 'No characteristic ' + c);
      return new Characteristic(this.dev, this.uuid, id);
    }
  }
  class Device extends Emitter {
    constructor(id, name) {
      super(); this.id = id; this.name = name || 'Polar H10'; this._subs = []; this._services = [];
      const dev = this;
      this.gatt = {
        connected: false, device: dev,
        async connect() {
          await init(); dev._drop();
          if (!dev._discSub) dev._discSub = nativeOn(BLE, `disconnected|${dev.id}`, () => {
            dev.gatt.connected = false; dev._drop(); dev._emit('gattserverdisconnected', { target: dev });
          });
          await nativeCall(BLE, 'connect', { deviceId: dev.id, timeout: 15000 });
          const r = await nativeCall(BLE, 'getServices', { deviceId: dev.id });
          dev._services = (r && r.services) || []; dev.gatt.connected = true;
          return dev.gatt;
        },
        disconnect() { nativeCall(BLE, 'disconnect', { deviceId: dev.id }).catch(() => {}); },
        async getPrimaryService(s) {
          const id = uuid(s), found = dev._services.find(x => String(x.uuid).toLowerCase() === id);
          if (!found) throw domErr('NotFoundError', 'No service ' + s);
          return new Service(dev, found);
        }
      };
    }
    _drop() { for (const s of this._subs) { try { s.remove(); } catch (e) {} } this._subs = []; }   // old notification listeners must not double up after a reconnect
  }
  const bluetooth = {
    async requestDevice(opts) {
      await init();
      const prefixes = ((opts && opts.filters) || []).map(f => f.namePrefix).filter(Boolean);
      let common = prefixes[0] || ''; for (const p of prefixes) while (!p.startsWith(common)) common = common.slice(0, -1);
      try {
        const d = await nativeCall(BLE, 'requestDevice', common ? { namePrefix: common } : {});
        return new Device(d.deviceId, d.name);
      } catch (e) {
        const m = String(e && e.message || e);
        throw domErr(/cancel|no device/i.test(m) ? 'NotFoundError' : 'NetworkError', m);
      }
    },
    getAvailability: async () => true
  };
  try { Object.defineProperty(navigator, 'bluetooth', { value: bluetooth, configurable: true }); } catch (e) { navigator.bluetooth = bluetooth; }

  // Android Back button: go back inside the app; on the home or recording screen, leave the app running in the background
  window.leadOneBack = () => {
    const scr = document.body.dataset.screen || 'scrHome';
    if (scr === 'scrHome' || scr === 'scrRec' || scr === 'scrAck') return false;
    if (scr === 'scrSettings' && !document.getElementById('setupIntro').hidden) return false;   // first-run setup
    const back = scr === 'scrHelp' ? document.getElementById('btnHelpBack') : scr === 'scrReport' ? document.getElementById('btnBack') : null;
    if (back) back.click(); else if (typeof show === 'function') show('scrHome');
    return true;
  };
})();
