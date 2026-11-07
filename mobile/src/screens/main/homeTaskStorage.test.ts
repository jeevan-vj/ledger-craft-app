import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { homeTaskStorage, HOME_TASKS_DISMISSED_KEY } from './homeTaskStorage';
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn()}));
const original=Platform.OS;
afterEach(()=>{Object.defineProperty(Platform,'OS',{value:original,configurable:true});jest.clearAllMocks();});
it('retains browser task dismissal across reads without calling unavailable native secure storage',async()=>{
 Object.defineProperty(Platform,'OS',{value:'web',configurable:true});const values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)},configurable:true});
 expect(await homeTaskStorage.isDismissed()).toBe(false);await homeTaskStorage.dismiss();expect(values.get(HOME_TASKS_DISMISSED_KEY)).toBe('dismissed');expect(await homeTaskStorage.isDismissed()).toBe(true);expect(SecureStore.getItemAsync).not.toHaveBeenCalled();expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
it('keeps native dismissal in secure storage',async()=>{Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});jest.mocked(SecureStore.getItemAsync).mockResolvedValue('dismissed');expect(await homeTaskStorage.isDismissed()).toBe(true);await homeTaskStorage.dismiss();expect(SecureStore.setItemAsync).toHaveBeenCalledWith(HOME_TASKS_DISMISSED_KEY,'dismissed');});
