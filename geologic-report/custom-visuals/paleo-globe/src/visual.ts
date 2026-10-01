/* eslint-disable powerbi-visuals/no-inner-outer-html */
import type powerbi from "powerbi-visuals-api";
import * as d3 from "d3";
import { SNAPSHOTS } from "./snapshots";
import { globeDefaults, globeFormattingModel, readGlobeSettings } from "./settings";
import "../style/visual.css";

type GlobeDatum={period:string;series:string;age:number;title:string;label:string;narrative:string};
export class Visual implements powerbi.extensibility.visual.IVisual{
  private root:HTMLDivElement;private svg:d3.Selection<SVGSVGElement,unknown,null,undefined>;private datum:GlobeDatum|null=null;
  private width=500;private height=500;private rotation:[number,number]=[-15,-18];private scaleFactor=1;
  private settings={...globeDefaults};
  constructor(options?:powerbi.extensibility.visual.VisualConstructorOptions){
    if(!options) throw new Error("Power BI must supply visual constructor options.");
    this.root=document.createElement("div");this.root.className="globe-root";this.root.innerHTML='<header><h2 id="title">Earth through time</h2><span>Drag to rotate · scroll to zoom</span></header><div class="globe-wrap"><div class="snapshot"><span>Selected series</span><strong id="label">—</strong></div><svg aria-label="Reconstructed continents on a globe"></svg></div><p id="narrative"></p>';options.element.appendChild(this.root);this.svg=d3.select(this.root).select("svg");
    this.svg.call(d3.drag<SVGSVGElement,unknown>().on("drag",e=>{this.rotation=[this.rotation[0]+e.dx*.35,Math.max(-80,Math.min(80,this.rotation[1]-e.dy*.35))];this.renderGlobe();}));
    this.svg.on("wheel",e=>{e.preventDefault();this.scaleFactor=Math.max(.7,Math.min(2.2,this.scaleFactor*(e.deltaY>0?.92:1.08)));this.renderGlobe();},{passive:false});
  }
  public update(options:powerbi.extensibility.visual.VisualUpdateOptions):void{
    this.settings=readGlobeSettings(options.dataViews?.[0]);this.applySettings();
    this.width=Math.max(260,options.viewport.width);this.height=Math.max(260,options.viewport.height-150);const table=options.dataViews?.[0]?.table;
    if(table?.rows?.length){const ix=(role:string)=>table.columns.findIndex(c=>Boolean(c.roles?.[role]));const candidates=table.rows.map(r=>({period:String(r[ix("period")]??""),series:String(r[ix("series")]??""),age:Number(r[ix("snapshotAge")]),title:String(r[ix("visualTitle")]??"Earth through time"),label:String(r[ix("snapshotLabel")]??""),narrative:String(r[ix("narrative")]??"")})).filter(d=>Number.isFinite(d.age));const target=d3.mean(candidates,d=>d.age)??0;this.datum=candidates.reduce((best,d)=>Math.abs(d.age-target)<Math.abs(best.age-target)?d:best);}
    else this.datum=null;
    (this.root.querySelector("#title") as HTMLElement).textContent=this.datum?.title||"Earth through time";(this.root.querySelector("#label") as HTMLElement).textContent=this.datum?.label||"Add snapshot fields";(this.root.querySelector("#narrative") as HTMLElement).textContent=this.datum?.narrative||"Add the series, snapshot age, title, label, and narrative fields to render this visual.";this.renderGlobe();
  }
  public getFormattingModel():powerbi.visuals.FormattingModel{return globeFormattingModel(this.settings);}
  private applySettings():void{const s=this.settings,root=document.documentElement;root.style.setProperty("--visual-bg",s.backgroundColor);this.root.style.setProperty("--heading-size",`${s.headingSize}px`);this.root.style.setProperty("--snapshot-size",`${s.snapshotSize}px`);this.root.style.setProperty("--narrative-size",`${s.narrativeSize}px`);this.root.style.setProperty("--land-color",s.landColor);this.root.style.setProperty("--ocean-color",s.oceanColor);this.root.style.padding=`${s.padding}px`;}
  private renderGlobe():void{
    const W=this.width,H=this.height;this.svg.attr("viewBox",`0 0 ${W} ${H}`).selectAll("*").remove();if(!this.datum||!Number.isFinite(this.datum.age))return;
    const ages=Object.keys(SNAPSHOTS).map(Number),nearest=ages.reduce((a,b)=>Math.abs(b-this.datum!.age)<Math.abs(a-this.datum!.age)?b:a),projection=d3.geoOrthographic().translate([W/2,H/2]).scale(Math.min(W,H)*.42*this.scaleFactor).rotate(this.rotation).clipAngle(90).precision(.35),path=d3.geoPath(projection);
    this.svg.append("path").datum({type:"Sphere"} as d3.GeoPermissibleObjects).attr("class","sphere").attr("d",path);
    this.svg.append("path").datum(d3.geoGraticule10()).attr("class","graticule").attr("d",path);
    this.svg.append("path").datum(SNAPSHOTS[String(nearest)] as d3.GeoPermissibleObjects).attr("class","land").attr("d",path);
  }
}
