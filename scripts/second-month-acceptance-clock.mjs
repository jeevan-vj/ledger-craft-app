// Synthetic local acceptance clock. Never imported by production source.
const NativeDate = globalThis.Date;
const fixed = NativeDate.parse('2027-05-01T00:00:00.000Z');
function AcceptanceDate(...args) {
 if (!new.target) return new NativeDate(fixed).toString();
 return Reflect.construct(NativeDate, args.length ? args : [fixed], new.target);
}
Object.setPrototypeOf(AcceptanceDate, NativeDate);
AcceptanceDate.prototype = NativeDate.prototype;
AcceptanceDate.now = () => fixed;
globalThis.Date = AcceptanceDate;
