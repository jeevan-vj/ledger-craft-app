import {financialReportCsv,type FinancialReportResponse,type ReportSection} from '@ledgercraft/contracts';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import {isShareSheetDismissal} from '@/utils/shareSheet';
import {financialReportHtml} from './financialReportHtml';
export async function shareFinancialReport(report:FinancialReportResponse,section:ReportSection,business:string,format:'pdf'|'csv'){
 if(!await Sharing.isAvailableAsync())throw new Error('File sharing is not available on this device.');
 let uri:string;
 if(format==='pdf'){const file=await Print.printToFileAsync({html:financialReportHtml(report,section,business),width:report.columns?842:595,height:report.columns?595:842});uri=file.uri;}
 else{if(!FileSystem.cacheDirectory)throw new Error('Temporary file storage is unavailable.');uri=`${FileSystem.cacheDirectory}Report-${section}-${report.meta.from}-${report.meta.to}.csv`;await FileSystem.writeAsStringAsync(uri,financialReportCsv(report,section),{encoding:FileSystem.EncodingType.UTF8});}
 try{await Sharing.shareAsync(uri,{mimeType:format==='pdf'?'application/pdf':'text/csv',dialogTitle:`Share ${section}`,UTI:format==='pdf'?'com.adobe.pdf':'public.comma-separated-values-text'});}catch(error){if(!isShareSheetDismissal(error))throw error;}
}
