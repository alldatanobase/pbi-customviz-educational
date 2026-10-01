import powerbi from "powerbi-visuals-api";

export interface FleetSettings{
  backgroundColor:string;cardColor:string;selectedColor:string;normalColor:string;watchColor:string;alertColor:string;padding:number;cardGap:number;
  showHeading:boolean;showMetrics:boolean;headingSize:number;subtitleSize:number;machineSize:number;statusSize:number;metricSize:number;labelSize:number;messageSize:number;
}

export const fleetDefaults:FleetSettings={backgroundColor:"#05080c",cardColor:"#0d171e",selectedColor:"#24e2d3",normalColor:"#55efb0",watchColor:"#ffc35c",alertColor:"#ff6259",padding:12,cardGap:10,showHeading:true,showMetrics:true,headingSize:22,subtitleSize:13,machineSize:21,statusSize:12,metricSize:16,labelSize:10,messageSize:15};

export function readFleetSettings(view?:powerbi.DataView):FleetSettings{
  const a=view?.metadata.objects?.appearance,b=view?.metadata.objects?.behavior,t=view?.metadata.objects?.text;
  return{backgroundColor:fill(a?.backgroundColor,fleetDefaults.backgroundColor),cardColor:fill(a?.cardColor,fleetDefaults.cardColor),selectedColor:fill(a?.selectedColor,fleetDefaults.selectedColor),normalColor:fill(a?.normalColor,fleetDefaults.normalColor),watchColor:fill(a?.watchColor,fleetDefaults.watchColor),alertColor:fill(a?.alertColor,fleetDefaults.alertColor),padding:num(a?.padding,0,30,fleetDefaults.padding),cardGap:num(a?.cardGap,0,30,fleetDefaults.cardGap),showHeading:bool(b?.showHeading,fleetDefaults.showHeading),showMetrics:bool(b?.showMetrics,fleetDefaults.showMetrics),headingSize:num(t?.headingSize,14,38,fleetDefaults.headingSize),subtitleSize:num(t?.subtitleSize,9,24,fleetDefaults.subtitleSize),machineSize:num(t?.machineSize,13,34,fleetDefaults.machineSize),statusSize:num(t?.statusSize,9,22,fleetDefaults.statusSize),metricSize:num(t?.metricSize,11,30,fleetDefaults.metricSize),labelSize:num(t?.labelSize,9,20,fleetDefaults.labelSize),messageSize:num(t?.messageSize,10,26,fleetDefaults.messageSize)};
}

export function fleetFormattingModel(s:FleetSettings):powerbi.visuals.FormattingModel{return{cards:[
  {uid:"appearance-card",displayName:"Appearance",groups:[{uid:"colors",displayName:"Colors and layout",slices:[color("background","Background color","backgroundColor",s.backgroundColor),color("card","Card color","cardColor",s.cardColor),color("selected","Selected color","selectedColor",s.selectedColor),color("normal","Normal color","normalColor",s.normalColor),color("watch","Watch color","watchColor",s.watchColor),color("alert","Alert color","alertColor",s.alertColor),numberSlice("padding","Internal padding","appearance","padding",s.padding),numberSlice("gap","Card spacing","appearance","cardGap",s.cardGap)]}],revertToDefaultDescriptors:desc("appearance",["backgroundColor","cardColor","selectedColor","normalColor","watchColor","alertColor","padding","cardGap"])},
  {uid:"behavior-card",displayName:"Behavior",groups:[{uid:"content",displayName:"Content",slices:[toggle("heading","Show heading","showHeading",s.showHeading),toggle("metrics","Show card metrics","showMetrics",s.showMetrics)]}],revertToDefaultDescriptors:desc("behavior",["showHeading","showMetrics"])},
  {uid:"text-card",displayName:"Text sizes",groups:[{uid:"header-text",displayName:"Visual heading",slices:[numberSlice("heading-size","Heading","text","headingSize",s.headingSize),numberSlice("subtitle-size","Subtitle","text","subtitleSize",s.subtitleSize)]},{uid:"card-text",displayName:"Cards",slices:[numberSlice("machine-size","Machine name","text","machineSize",s.machineSize),numberSlice("status-size","Status","text","statusSize",s.statusSize),numberSlice("metric-size","Metric values","text","metricSize",s.metricSize),numberSlice("label-size","Metric labels","text","labelSize",s.labelSize),numberSlice("message-size","Data message","text","messageSize",s.messageSize)]}],revertToDefaultDescriptors:desc("text",["headingSize","subtitleSize","machineSize","statusSize","metricSize","labelSize","messageSize"])}
]};}

function color(uid:string,displayName:string,propertyName:string,value:string):powerbi.visuals.FormattingSlice{return{uid,displayName,control:{type:"ColorPicker",properties:{descriptor:{objectName:"appearance",propertyName},value:{value}}}};}
function numberSlice(uid:string,displayName:string,objectName:string,propertyName:string,value:number):powerbi.visuals.FormattingSlice{return{uid,displayName,control:{type:"NumUpDown",properties:{descriptor:{objectName,propertyName},value}}};}
function toggle(uid:string,displayName:string,propertyName:string,value:boolean):powerbi.visuals.FormattingSlice{return{uid,displayName,control:{type:"ToggleSwitch",properties:{descriptor:{objectName:"behavior",propertyName},value}}};}
function desc(objectName:string,names:string[]){return names.map(propertyName=>({objectName,propertyName}));}
function fill(value:powerbi.DataViewPropertyValue|undefined,fallback:string):string{const f=value as powerbi.Fill|undefined;return f?.solid?.color||fallback;}
function num(value:powerbi.DataViewPropertyValue|undefined,min:number,max:number,fallback:number):number{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function bool(value:powerbi.DataViewPropertyValue|undefined,fallback:boolean):boolean{return typeof value==="boolean"?value:fallback;}
