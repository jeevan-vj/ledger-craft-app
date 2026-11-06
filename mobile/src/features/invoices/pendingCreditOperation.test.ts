import * as SecureStore from 'expo-secure-store';
import { pendingCreditOperation } from './pendingCreditOperation';
const invoice='22222222-2222-4222-8222-222222222222';
const issue={kind:'issue' as const,payload:{invoiceId:invoice,issueDate:'2026-11-06',reason:'Reviewed customer credit',taxInclusive:false,taxRate:'15',items:[{description:'Services returned',quantity:'1',rate:'200.00'}]}};
beforeEach(()=>{jest.clearAllMocks();const data=new Map<string,string>();jest.mocked(SecureStore.getItemAsync).mockImplementation(async key=>data.get(key)??null);jest.mocked(SecureStore.setItemAsync).mockImplementation(async(key,value)=>{data.set(key,value);});jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key=>{data.delete(key);});});
it('restores the exact credit issue key/body after lost response and retains it across later auth failures',async()=>{
 const first=await pendingCreditOperation.claim('owner',invoice,issue);await pendingCreditOperation.fail('owner',invoice,0);await pendingCreditOperation.fail('owner',invoice,401);
 const restored=await pendingCreditOperation.load('owner',invoice);expect(restored).toEqual({...first,uncertain:true});expect(restored?.input).toEqual(issue);
 expect(await pendingCreditOperation.load('another-owner',invoice)).toBeNull();await pendingCreditOperation.clear('owner',invoice);expect(await pendingCreditOperation.load('owner',invoice)).toBeNull();
});
