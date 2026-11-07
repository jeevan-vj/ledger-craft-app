import React,{useState} from 'react';
import {Text,View} from 'react-native';
import {ModernButton} from '@/components/ui/ModernButton';
import {SelectionSheet,SelectionRow} from '@/components/ui/SelectionSheet';
import {useTheme} from '@/theme';
export function ReportChoicePicker({label,value,choices,onChange}:{label:string;value:string;choices:{id:string;name:string}[];onChange:(id:string)=>void}){
 const theme=useTheme();const [open,setOpen]=useState(false);const [search,setSearch]=useState('');const filtered=choices.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()));
 return <View><Text style={theme.type.caption}>{label}</Text><ModernButton variant="secondary" onPress={()=>setOpen(true)}>{choices.find(c=>c.id===value)?.name??'Choose'}</ModernButton><SelectionSheet visible={open} title={label} searchPlaceholder={`Search ${label.toLowerCase()}`} searchQuery={search} onSearchChange={setSearch} onClose={()=>setOpen(false)} loading={false} empty={!filtered.length} emptyTitle="No matching choices">{filtered.map(choice=><SelectionRow key={choice.id} title={choice.name} selected={choice.id===value} onPress={()=>{onChange(choice.id);setOpen(false);}}/>)}</SelectionSheet></View>;
}
