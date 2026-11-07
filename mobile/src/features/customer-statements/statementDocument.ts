import type { CustomerStatement } from '@ledgercraft/contracts';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { isShareSheetDismissal } from '@/utils/shareSheet';
import { statementHtml } from './statementHtml';
export async function shareStatementPdf(value:CustomerStatement){if(!await Sharing.isAvailableAsync())throw new Error('PDF sharing is not available on this device.');const file=await Print.printToFileAsync({html:statementHtml(value),width:595,height:842});if(!file?.uri)throw new Error('The statement PDF could not be created.');try{await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',UTI:'com.adobe.pdf',dialogTitle:`Statement ${value.customer.name}`});}catch(error){if(!isShareSheetDismissal(error))throw error;}}
