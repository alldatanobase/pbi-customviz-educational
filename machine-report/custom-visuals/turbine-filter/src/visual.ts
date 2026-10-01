import powerbi from "powerbi-visuals-api";
import "../style/visual.css";
import { fleetDefaults, fleetFormattingModel, FleetSettings, readFleetSettings } from "./settings";

interface PartState{time:number;status:string;health?:number;uptime?:number}
interface MachineCard{id:string;alertCount:number;watchCount:number;health?:number;uptime?:number}
interface BasicMachineFilter extends powerbi.IFilter{$schema:string;filterType:number;target:{table:string;column:string};operator:"In";values:string[]}

export class Visual implements powerbi.extensibility.visual.IVisual{
  private host:powerbi.extensibility.visual.IVisualHost;
  private root:HTMLDivElement;
  private heading:HTMLElement;
  private cards:HTMLDivElement;
  private message:HTMLDivElement;
  private settings:FleetSettings={...fleetDefaults};
  private machineTarget:{table:string;column:string}|null=null;
  private activeMachines=new Set<string>();

  constructor(options?:powerbi.extensibility.visual.VisualConstructorOptions){
    if(!options)throw new Error("Power BI must supply visual constructor options.");
    this.host=options.host;
    this.root=document.createElement("div");this.root.className="fleet-root";
    this.heading=document.createElement("header");this.heading.className="fleet-heading";const title=document.createElement("strong");title.textContent="Turbine fleet";const subtitle=document.createElement("span");subtitle.textContent="Select a machine to inspect its assemblies";this.heading.append(title,subtitle);
    this.cards=document.createElement("div");this.cards.className="fleet-cards";
    this.message=document.createElement("div");this.message.className="fleet-message";this.message.textContent="Add Timestamp, Machine ID, Part key, and Part status.";
    this.root.append(this.heading,this.cards,this.message);options.element.appendChild(this.root);
  }

  public update(options:powerbi.extensibility.visual.VisualUpdateOptions):void{
    const view=options.dataViews?.[0];this.settings=readFleetSettings(view);this.applySettings();
    const machines=this.readData(view?.matrix);this.restoreFilter(options.jsonFilters);this.message.style.display=machines.length?"none":"flex";this.cards.style.display=machines.length?"flex":"none";this.render(machines);
  }

  public getFormattingModel():powerbi.visuals.FormattingModel{return fleetFormattingModel(this.settings);}

  private applySettings():void{
    const vars:Record<string,string>={"--visual-bg":this.settings.backgroundColor,"--card-bg":this.settings.cardColor,"--selected-color":this.settings.selectedColor,"--normal-color":this.settings.normalColor,"--watch-color":this.settings.watchColor,"--alert-color":this.settings.alertColor,"--card-gap":`${this.settings.cardGap}px`,"--heading-size":`${this.settings.headingSize}px`,"--subtitle-size":`${this.settings.subtitleSize}px`,"--machine-size":`${this.settings.machineSize}px`,"--status-size":`${this.settings.statusSize}px`,"--metric-size":`${this.settings.metricSize}px`,"--label-size":`${this.settings.labelSize}px`,"--message-size":`${this.settings.messageSize}px`};Object.entries(vars).forEach(([key,value])=>this.root.style.setProperty(key,value));this.root.style.padding=`${this.settings.padding}px`;this.heading.style.display=this.settings.showHeading?"flex":"none";
  }

  private readData(matrix?:powerbi.DataViewMatrix):MachineCard[]{
    const machineNodes=matrix?.rows.root.children;if(!matrix||!machineNodes?.length)return[];
    const machineSource=matrix.rows.levels.flatMap(level=>level.sources).find(source=>source.roles?.machineId);this.machineTarget=this.filterTarget(machineSource?.queryName);
    const roleAt=(node:powerbi.DataViewMatrixNode):string|undefined=>{const level=node.level===undefined?undefined:matrix.rows.levels[node.level],sourceIndex=node.levelValues?.[0]?.levelSourceIndex??0;return Object.entries(level?.sources[sourceIndex]?.roles||{}).find(([,active])=>active)?.[0];};
    const nodeValue=(node:powerbi.DataViewMatrixNode):powerbi.PrimitiveValue|undefined=>node.levelValues?.[0]?.value??node.value;
    const measure=(node:powerbi.DataViewMatrixNode,role:string):number|undefined=>{for(const [key,entry] of Object.entries(node.values||{})){const source=matrix.valueSources[entry.valueSourceIndex??Number(key)];if(source?.roles?.[role])return this.number(entry.value);}return undefined;};
    return machineNodes.map(machineNode=>{
      const id=String(nodeValue(machineNode)??"").trim(),parts=new Map<string,PartState>();
      const visit=(node:powerbi.DataViewMatrixNode,context:{time?:number;part?:string;status?:string}):void=>{const role=roleAt(node),raw=nodeValue(node),next={...context};if(role==="timestamp")next.time=this.time(raw,0);if(role==="partKey")next.part=String(raw??"");if(role==="status")next.status=String(raw??"Normal");if(node.children?.length)node.children.forEach(child=>visit(child,next));else if(next.part){const reading:PartState={time:next.time??0,status:next.status??"Normal",health:measure(node,"health"),uptime:measure(node,"uptime")},previous=parts.get(next.part);if(!previous||reading.time>=previous.time)parts.set(next.part,reading);}};
      machineNode.children?.forEach(child=>visit(child,{}));const current=Array.from(parts.values()),alertCount=current.filter(item=>item.status.toLowerCase()==="alert").length,watchCount=current.filter(item=>item.status.toLowerCase()==="watch").length,mean=(values:(number|undefined)[])=>{const valid=values.filter((item):item is number=>item!==undefined);return valid.length?valid.reduce((sum,item)=>sum+item,0)/valid.length:undefined;};return{id,alertCount,watchCount,health:mean(current.map(item=>item.health)),uptime:mean(current.map(item=>item.uptime))};
    }).filter(machine=>Boolean(machine.id)).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
  }

  private render(machines:MachineCard[]):void{
    const fragment=document.createDocumentFragment();machines.forEach(machine=>{const severity=machine.alertCount?"alert":machine.watchCount?"watch":"normal",card=document.createElement("button");card.type="button";card.className=`fleet-card ${severity}`;card.dataset.machine=machine.id;card.setAttribute("aria-label",`${machine.id}, ${this.statusText(machine)}`);
      const top=document.createElement("div");top.className="card-top";const icon=document.createElement("span");icon.className="turbine-icon";icon.setAttribute("aria-hidden","true");const identity=document.createElement("div");identity.className="identity";const name=document.createElement("strong");name.textContent=machine.id;const state=document.createElement("span");state.className="machine-status";state.textContent=this.statusText(machine);identity.append(name,state);top.append(icon,identity);card.appendChild(top);
      if(this.settings.showMetrics){const metrics=document.createElement("div");metrics.className="card-metrics";metrics.append(this.metric("Fleet health",machine.health,"",0),this.metric("Uptime",machine.uptime,"%",1));card.appendChild(metrics);}
      card.addEventListener("click",()=>this.filterMachine(machine.id));fragment.appendChild(card);});this.cards.replaceChildren(fragment);this.updateSelectionStyles();
  }

  private metric(label:string,value:number|undefined,suffix:string,digits:number):HTMLElement{const item=document.createElement("span");item.className="card-metric";const number=document.createElement("strong");number.textContent=value===undefined?"—":`${value.toFixed(digits)}${suffix}`;const caption=document.createElement("small");caption.textContent=label;item.append(number,caption);return item;}
  private statusText(machine:MachineCard):string{if(machine.alertCount)return `${machine.alertCount} active alert${machine.alertCount===1?"":"s"}`;if(machine.watchCount)return `${machine.watchCount} part${machine.watchCount===1?"":"s"} on watch`;return"All systems normal";}
  private filterMachine(machineId:string):void{if(!this.machineTarget)return;if(this.activeMachines.has(machineId)){this.activeMachines.clear();this.host.applyJsonFilter(null as unknown as powerbi.IFilter,"general","filter",powerbi.FilterAction.remove);}else{this.activeMachines=new Set([machineId]);const schema=String.fromCharCode(104,116,116,112,58)+"//powerbi.com/product/schema#basic",filter:BasicMachineFilter={$schema:schema,filterType:1,target:this.machineTarget,operator:"In",values:[machineId]};this.host.applyJsonFilter(filter,"general","filter",powerbi.FilterAction.merge);}this.updateSelectionStyles();}
  private restoreFilter(filters?:powerbi.IFilter[]):void{if(!this.machineTarget||!filters)return;const match=(filters as BasicMachineFilter[]).find(filter=>filter?.target?.table===this.machineTarget?.table&&filter?.target?.column===this.machineTarget?.column&&filter.operator==="In");this.activeMachines=new Set(match?.values?.map(String)||[]);}
  private filterTarget(queryName?:string):{table:string;column:string}|null{if(!queryName)return null;const bracket=/^'?(.+?)'?\[([^\]]+)\]$/.exec(queryName);if(bracket)return{table:bracket[1],column:bracket[2]};const split=queryName.indexOf(".");return split>0?{table:queryName.slice(0,split),column:queryName.slice(split+1)}:null;}
  private updateSelectionStyles():void{const hasSelection=this.activeMachines.size>0;this.cards.querySelectorAll<HTMLElement>(".fleet-card").forEach(card=>{const selected=this.activeMachines.has(card.dataset.machine||"");card.classList.toggle("selected",selected);card.classList.toggle("dimmed",hasSelection&&!selected);card.setAttribute("aria-pressed",String(selected));});}
  private number(value:powerbi.PrimitiveValue|undefined):number|undefined{const n=Number(value);return Number.isFinite(n)?n:undefined;}
  private time(value:powerbi.PrimitiveValue|undefined,fallback:number):number{if(value instanceof Date)return value.getTime();const parsed=new Date(String(value??"")).getTime();return Number.isFinite(parsed)?parsed:fallback;}
}
