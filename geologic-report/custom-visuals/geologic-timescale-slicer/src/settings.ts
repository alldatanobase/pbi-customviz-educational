import type powerbi from "powerbi-visuals-api";

export interface TimeSettings { backgroundColor:string; padding:number; headingSize:number; cellSize:number; axisSize:number }
export const timeDefaults:TimeSettings={backgroundColor:"#f4efe5",padding:0,headingSize:30,cellSize:14,axisSize:12};

export function readTimeSettings(dataView?:powerbi.DataView):TimeSettings{
  const a=dataView?.metadata.objects?.appearance,t=dataView?.metadata.objects?.text;
  return {backgroundColor:fill(a?.backgroundColor,timeDefaults.backgroundColor),padding:num(a?.padding,timeDefaults.padding,0,30),headingSize:num(t?.headingSize,timeDefaults.headingSize,16,48),cellSize:num(t?.cellSize,timeDefaults.cellSize,8,24),axisSize:num(t?.axisSize,timeDefaults.axisSize,8,20)};
}

export function timeFormattingModel(s:TimeSettings):powerbi.visuals.FormattingModel{return {cards:[
  {uid:"appearance-card",displayName:"Appearance",groups:[{uid:"appearance-group",displayName:"Visual surface",slices:[colorSlice("background","Background color","appearance","backgroundColor",s.backgroundColor),numberSlice("padding","Internal padding","appearance","padding",s.padding)]}],revertToDefaultDescriptors:descriptors("appearance",["backgroundColor","padding"])},
  {uid:"text-card",displayName:"Text sizes",groups:[{uid:"text-group",displayName:"Typography",slices:[numberSlice("heading","Heading","text","headingSize",s.headingSize),numberSlice("cell","Cell labels","text","cellSize",s.cellSize),numberSlice("axis","Column and age labels","text","axisSize",s.axisSize)]}],revertToDefaultDescriptors:descriptors("text",["headingSize","cellSize","axisSize"])}
]};}

function fill(value:unknown,fallback:string):string{const v=value as powerbi.Fill|undefined;return v?.solid?.color||fallback;}
function num(value:unknown,fallback:number,min:number,max:number):number{return typeof value==="number"&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;}
function colorSlice(uid:string,displayName:string,objectName:string,propertyName:string,value:string):powerbi.visuals.FormattingSlice{return {uid,displayName,control:{type:"ColorPicker",properties:{descriptor:{objectName,propertyName},value:{value}}}};}
function numberSlice(uid:string,displayName:string,objectName:string,propertyName:string,value:number):powerbi.visuals.FormattingSlice{return {uid,displayName,control:{type:"NumUpDown",properties:{descriptor:{objectName,propertyName},value}}};}
function descriptors(objectName:string,names:string[]){return names.map(propertyName=>({objectName,propertyName}));}
