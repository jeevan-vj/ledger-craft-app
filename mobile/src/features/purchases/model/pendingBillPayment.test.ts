import * as SecureStore from 'expo-secure-store';
import { pendingBillPayment } from './pendingBillPayment';
const owner='owner-1',bill='bill-1';
const input={bankAccountId:'44444444-4444-4444-8444-444444444444',amount:'69.00',paymentDate:'2026-04-20',exchangeRateId:'55555555-5555-4555-8555-555555555555'};
beforeEach(()=>{jest.clearAllMocks();const values=new Map<string,string>();jest.mocked(SecureStore.getItemAsync).mockImplementation(async key=>values.get(key)??null);jest.mocked(SecureStore.setItemAsync).mockImplementation(async(key,value)=>{values.set(key,value);});jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key=>{values.delete(key);});});
it('persists exact69 payment and reviewed rate identity before sending and recovers same key after reopening',async()=>{
 const first=await pendingBillPayment.claim(owner,bill,input);expect(first.input).toEqual(input);expect(first.key).toEqual(expect.any(String));
 const restored=await pendingBillPayment.load(owner,bill);expect(restored).toEqual(first);
 const retry=await pendingBillPayment.claim(owner,bill,{...input,amount:'70.00'});expect(retry).toEqual(first);
 await pendingBillPayment.clear(owner,bill);expect(await pendingBillPayment.load(owner,bill)).toBeNull();
});
it('keeps payment attempts isolated by user and bill and refuses sending when local persistence fails',async()=>{
 await pendingBillPayment.claim(owner,bill,input);expect(await pendingBillPayment.load('other-user',bill)).toBeNull();expect(await pendingBillPayment.load(owner,'other-bill')).toBeNull();
 jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('Device storage unavailable'));
 await expect(pendingBillPayment.claim(owner,'new-bill',input)).rejects.toThrow('Device storage unavailable');
});
it('retains an uncertain request after later401 or422, but releases a first definite422 for correction',async()=>{
 const first=await pendingBillPayment.claim(owner,bill,input);
 await pendingBillPayment.fail(owner,bill,0);await pendingBillPayment.fail(owner,bill,401);await pendingBillPayment.fail(owner,bill,422);
 expect(await pendingBillPayment.load(owner,bill)).toEqual({...first,uncertain:true});
 const fresh=await pendingBillPayment.claim(owner,'second-bill',input);await pendingBillPayment.fail(owner,'second-bill',422);expect(await pendingBillPayment.load(owner,'second-bill')).toBeNull();
 const corrected=await pendingBillPayment.claim(owner,'second-bill',{...input,amount:'70.00'});expect(corrected.key).not.toBe(fresh.key);
});
