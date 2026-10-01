import powerbi from "powerbi-visuals-api";
import "../style/visual.css";
import { detailDefaults, detailFormattingModel, DetailSettings, readDetailSettings } from "./settings";

interface Reading{time:number;temperature?:number;vibration?:number;uptime?:number;health?:number}
interface AssemblyData{key:string;name:string;system:string;status:string;description:string;note:string;readings:Reading[]}

export class Visual implements powerbi.extensibility.visual.IVisual{
  private root:HTMLDivElement;
  private settings:DetailSettings={...detailDefaults};

  constructor(options?:powerbi.extensibility.visual.VisualConstructorOptions){if(!options)throw new Error("Power BI must supply visual constructor options.");this.root=document.createElement("div");this.root.className="detail-root";options.element.appendChild(this.root);}

  public update(options:powerbi.extensibility.visual.VisualUpdateOptions):void{
    const view=options.dataViews?.[0];this.settings=readDetailSettings(view);this.applySettings();
    const assembly=this.readData(view?.table);
    if(!assembly){this.showEmpty(view?.table?"Select one assembly in the turbine to see its operating history.":"Add Timestamp, Part key, and the four metric fields.");return;}
    this.render(assembly);
  }

  public getFormattingModel():powerbi.visuals.FormattingModel{return detailFormattingModel(this.settings);}

  private applySettings():void{this.root.style.setProperty("--visual-bg",this.settings.backgroundColor);this.root.style.setProperty("--panel-label-size",`${this.settings.panelLabelSize}px`);this.root.style.setProperty("--status-size",`${this.settings.statusSize}px`);this.root.style.setProperty("--system-size",`${this.settings.systemSize}px`);this.root.style.setProperty("--heading-size",`${this.settings.headingSize}px`);this.root.style.setProperty("--description-size",`${this.settings.descriptionSize}px`);this.root.style.setProperty("--metric-label-size",`${this.settings.metricLabelSize}px`);this.root.style.setProperty("--metric-size",`${this.settings.metricSize}px`);this.root.style.setProperty("--metric-caption-size",`${this.settings.metricCaptionSize}px`);this.root.style.setProperty("--narrative-size",`${this.settings.narrativeSize}px`);this.root.style.setProperty("--empty-size",`${this.settings.emptySize}px`);this.root.style.padding=`${this.settings.padding}px`;}

  private readData(table?:powerbi.DataViewTable):AssemblyData|null{
    const rows=table?.rows;if(!table||!rows?.length)return null;
    const index=(role:string)=>table.columns.findIndex(column=>Boolean(column.roles?.[role]));
    const timestamp=index("timestamp"),partKey=index("partKey"),partName=index("partName"),system=index("system"),status=index("status"),description=index("description"),note=index("note"),temperature=index("temperature"),vibration=index("vibration"),uptime=index("uptime"),health=index("health");
    if(timestamp<0||partKey<0)return null;
    const keys=new Set(rows.map(row=>String(row[partKey]??"")));
    if(keys.size!==1)return null;
    const latestRow=rows.reduce((latest,row)=>this.time(row[timestamp])>=this.time(latest[timestamp])?row:latest,rows[0]);
    const readings=rows.map((row,rowIndex):Reading=>({time:this.time(row[timestamp],rowIndex),temperature:this.value(row[temperature]),vibration:this.value(row[vibration]),uptime:this.value(row[uptime]),health:this.value(row[health])})).sort((a,b)=>a.time-b.time);
    const text=(position:number,fallback:string)=>position>=0?String(latestRow[position]??fallback):fallback;
    return{key:text(partKey,""),name:text(partName,text(partKey,"Selected assembly")),system:text(system,"Machine assembly"),status:text(status,"Normal"),description:text(description,"Current operating condition for the selected turbine assembly."),note:text(note,"Recent synthetic readings provide context for the current condition."),readings};
  }

  private render(data:AssemblyData):void{
    const latest=data.readings[data.readings.length-1],statusClass=data.status.toLowerCase()==="alert"?"alert":data.status.toLowerCase()==="watch"?"watch":"";
    const header=this.node("header","detail-head"),headerLabel=this.node("span","","Selected assembly"),statusElement=this.node("span","status");header.append(headerLabel,statusElement);
    const details=this.node("div","details"),systemElement=this.node("div","system"),nameElement=this.node("h2","part-name"),descriptionElement=this.node("p","description"),metrics=this.node("div","metrics");details.append(systemElement,nameElement,descriptionElement,metrics);
    const metricDefinitions=[
      {key:"temperature",label:"Temperature",caption:"current · selected history",aria:"Temperature trend"},
      {key:"vibration",label:"Vibration",caption:"RMS velocity · selected history",aria:"Vibration trend"},
      {key:"uptime",label:"Uptime",caption:"rolling 30 days · selected history",aria:"Uptime trend"},
      {key:"health",label:"Health score",caption:"out of 100 · selected history",aria:"Health score trend"}
    ];
    metricDefinitions.forEach(definition=>{const metric=this.node("div","metric"),label=this.node("span","metric-label",definition.label),value=this.node("strong");value.dataset.value=definition.key;const caption=this.node("small","",definition.caption),svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.classList.add("sparkline");svg.dataset.chart=definition.key;svg.setAttribute("viewBox","0 0 220 50");svg.setAttribute("role","img");svg.setAttribute("aria-label",definition.aria);metric.append(label,value,caption,svg);metrics.appendChild(metric);});
    const callout=this.node("div","callout");details.appendChild(callout);this.root.replaceChildren(header,details);
    statusElement.textContent=data.status;statusElement.className=`status ${statusClass}`;systemElement.textContent=data.system;nameElement.textContent=data.name;descriptionElement.textContent=data.description;callout.textContent=data.note;
    this.setValue("temperature",latest.temperature,"°C",0);this.setValue("vibration",latest.vibration," mm/s",1);this.setValue("uptime",latest.uptime,"%",1);this.setValue("health",latest.health,"",0);
    const signal=statusClass==="alert"?this.settings.alertColor:statusClass==="watch"?this.settings.watchColor:this.settings.normalColor;
    this.draw("temperature",data.readings.map(d=>d.temperature),signal);this.draw("vibration",data.readings.map(d=>d.vibration),signal);this.draw("uptime",data.readings.map(d=>d.uptime),"#55c9ff");this.draw("health",data.readings.map(d=>d.health),statusClass?signal:"#55efb0");
  }

  private showEmpty(message:string):void{this.root.replaceChildren(this.node("div","empty",message));}
  private setValue(name:string,value:number|undefined,suffix:string,digits:number):void{const element=this.root.querySelector(`[data-value="${name}"]`) as HTMLElement;element.textContent=value===undefined?"—":`${value.toFixed(digits)}${suffix}`;}
  private draw(name:string,input:(number|undefined)[],color:string):void{
    const svg=this.root.querySelector(`[data-chart="${name}"]`) as SVGElement,values=input.filter((value):value is number=>value!==undefined&&Number.isFinite(value));svg.style.setProperty("--spark-color",color);
    if(values.length<2){const baseline=this.svgNode("line","spark-grid",{x1:"4",y1:"46",x2:"216",y2:"46"});svg.replaceChildren(baseline);return;}
    const width=220,height=50,pad=4,minValue=Math.min(...values),maxValue=Math.max(...values),buffer=Math.max((maxValue-minValue)*.16,Math.abs(maxValue)*.006,.1),min=minValue-buffer,max=maxValue+buffer;
    const points=values.map((value,index)=>[pad+index/(values.length-1)*(width-pad*2),height-pad-(value-min)/(max-min)*(height-pad*2)]);
    const line=points.map((point,index)=>`${index?"L":"M"}${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(" "),last=points[points.length-1],area=`${line} L${last[0].toFixed(2)},${height-pad} L${points[0][0].toFixed(2)},${height-pad} Z`;
    svg.replaceChildren(this.svgNode("line","spark-grid",{x1:String(pad),y1:String(height-pad),x2:String(width-pad),y2:String(height-pad)}),this.svgNode("path","spark-area",{d:area}),this.svgNode("path","spark-line",{d:line}),this.svgNode("circle","spark-end",{cx:String(last[0]),cy:String(last[1]),r:"2.8"}));
  }
  private node<K extends keyof HTMLElementTagNameMap>(tag:K,className="",text=""):HTMLElementTagNameMap[K]{const element=document.createElement(tag);if(className)element.className=className;if(text)element.textContent=text;return element;}
  private svgNode(tag:string,className:string,attributes:Record<string,string>):SVGElement{const element=document.createElementNS("http://www.w3.org/2000/svg",tag);element.setAttribute("class",className);Object.entries(attributes).forEach(([name,value])=>element.setAttribute(name,value));return element;}
  private value(value:powerbi.PrimitiveValue|undefined):number|undefined{const number=Number(value);return Number.isFinite(number)?number:undefined;}
  private time(value:powerbi.PrimitiveValue|undefined,fallback=0):number{if(value instanceof Date)return value.getTime();const parsed=new Date(String(value??"")).getTime();return Number.isFinite(parsed)?parsed:fallback;}
}
