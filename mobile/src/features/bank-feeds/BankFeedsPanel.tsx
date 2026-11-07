import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ModernButton } from '@/components/ui/ModernButton';
import { space, useTheme } from '@/theme';
import { bankFeedsApi } from './bankFeedsApi';
/** Read-only internal preview. Full App enrollment stays gated until native lock acceptance. */
export function BankFeedsPanel(){
 const theme=useTheme();const query=useQuery({queryKey:['bank-feeds','akahu'],queryFn:bankFeedsApi.summary});const data=query.data;
 return <View style={{gap:space.md}}><Text style={theme.type.headline}>Bank connections</Text>
  {query.isPending?<ActivityIndicator accessibilityLabel="Loading bank connections" color={theme.colors.accentText}/>:null}
  {query.error?<><Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{query.error instanceof Error?query.error.message:'Unable to load bank connections.'}</Text><ModernButton variant="secondary" onPress={()=>void query.refetch()}>Retry bank connections</ModernButton></>:null}
  {data?<><Text style={theme.type.body}>Connection: {data.status.replace(/_/g,' ')}</Text>{data.warnings.map(w=><Text key={w} style={theme.type.subhead}>{w}</Text>)}
   {!data.accounts.length?<Text style={theme.type.body}>No connected accounts.</Text>:null}
   {data.accounts.map(a=><View key={a.id} style={{gap:space.xs}}><Text style={theme.type.callout}>{a.name}</Text><Text style={theme.type.body}>{a.institution} · {a.currency} · {a.status==='INACTIVE'?'Inactive — review in Akahu':'Active'}</Text>{a.lastSyncedAt?<Text style={theme.type.caption}>Last sync {a.lastSyncedAt}</Text>:null}</View>)}
   <Text style={theme.type.subhead}>Full App connection management requires approved provider setup and native app-lock verification. Manage the internal Personal App from the web workspace.</Text>
  </>:null}
 </View>;
}
