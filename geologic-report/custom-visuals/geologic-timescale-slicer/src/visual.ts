/* eslint-disable powerbi-visuals/no-inner-outer-html */
import type powerbi from "powerbi-visuals-api";
import * as d3 from "d3";
import { readTimeSettings, timeDefaults, timeFormattingModel } from "./settings";
import "../style/visual.css";

type Row = { name:string; rank:string; parent:string; era:string; periodKey:string; older:number; younger:number; color:string; id:powerbi.visuals.ISelectionId };
const ranks=["Era","Period","Epoch"];

export class Visual implements powerbi.extensibility.visual.IVisual {
  private host: powerbi.extensibility.visual.IVisualHost;
  private selection: powerbi.extensibility.ISelectionManager;
  private root: HTMLDivElement;
  private svg: d3.Selection<SVGSVGElement,unknown,null,undefined>;
  private rows: Row[]=[];
  private width=300; private height=600;
  private transform=d3.zoomIdentity;
  private zoom: d3.ZoomBehavior<SVGSVGElement,unknown>;
  private settings={...timeDefaults};

  constructor(options?: powerbi.extensibility.visual.VisualConstructorOptions){
    if(!options) throw new Error("Power BI must supply visual constructor options.");
    this.host=options.host; this.selection=this.host.createSelectionManager();
    this.root=document.createElement("div");this.root.className="timescale-root";
    this.root.innerHTML='<header><h2>Geologic time</h2><span>Present at top · click a cell to filter</span></header><div class="chart"><svg aria-label="Zoomable vertical geologic time scale"></svg><div class="zoom-controls"><button data-z="in">+</button><button data-z="out">−</button><button data-z="reset">All</button></div></div>';
    options.element.appendChild(this.root);this.svg=d3.select(this.root).select("svg");
    this.zoom=d3.zoom<SVGSVGElement,unknown>().scaleExtent([1,12]).on("zoom",e=>{this.transform=e.transform;this.render();});
    this.svg.call(this.zoom).on("dblclick.zoom",null);
    this.root.querySelectorAll<HTMLButtonElement>("button").forEach(b=>b.addEventListener("click",()=>{
      const action=b.dataset.z;if(action==="reset")this.svg.transition().duration(250).call(this.zoom.transform,d3.zoomIdentity);
      else this.svg.transition().duration(180).call(this.zoom.scaleBy,action==="in"?1.5:1/1.5);
    }));
  }

  public update(options: powerbi.extensibility.visual.VisualUpdateOptions):void{
    this.settings=readTimeSettings(options.dataViews?.[0]);this.applySettings();
    this.width=Math.max(230,options.viewport.width);this.height=Math.max(320,options.viewport.height-52);
    const table=options.dataViews?.[0]?.table;if(!table?.rows){this.rows=[];this.render();return;}
    const index=(role:string)=>table.columns.findIndex(c=>Boolean(c.roles?.[role]));
    const ix={name:index("unitName"),rank:index("rank"),parent:index("parent"),era:index("era"),period:index("periodKey"),older:index("olderMa"),younger:index("youngerMa"),color:index("color")};
    this.rows=table.rows.map((r,i)=>({name:String(r[ix.name]??""),rank:String(r[ix.rank]??""),parent:String(r[ix.parent]??""),era:String(r[ix.era]??""),periodKey:String(r[ix.period]??""),older:Number(r[ix.older]),younger:Number(r[ix.younger]),color:String(r[ix.color]??"#ddd"),id:this.host.createSelectionIdBuilder().withTable(table,i).createSelectionId()})).filter(r=>r.name&&ranks.includes(r.rank)&&Number.isFinite(r.older)&&Number.isFinite(r.younger));
    this.render();
  }

  public getFormattingModel():powerbi.visuals.FormattingModel{return timeFormattingModel(this.settings);}

  private applySettings():void{const s=this.settings,root=document.documentElement;root.style.setProperty("--visual-bg",s.backgroundColor);this.root.style.setProperty("--heading-size",`${s.headingSize}px`);this.root.style.setProperty("--cell-size",`${s.cellSize}px`);this.root.style.setProperty("--axis-size",`${s.axisSize}px`);this.root.style.padding=`${s.padding}px`;}

  private render():void{
    const W=this.width,H=this.height,top=34,right=46,bottom=8,left=0;this.zoom.extent([[0,top],[W,H-bottom]]).translateExtent([[0,top],[W,H-bottom]]);this.svg.attr("viewBox",`0 0 ${W} ${H}`);this.svg.selectAll("*").remove();
    if(!this.rows.length){this.svg.append("text").attr("class","empty").attr("x",W/2).attr("y",H/2).attr("text-anchor","middle").text("Add the time-scale fields to this visual.");return;}
    const maxAge=d3.max(this.rows,d=>d.older)??538.8,base=d3.scaleLinear().domain([0,maxAge]).range([top,H-bottom]);
    const y=this.transform.rescaleY(base),available=W-right-left,widths=[.12,.43,.45].map(v=>v*available),starts=[left];for(let i=1;i<3;i++)starts.push(starts[i-1]+widths[i-1]);
    this.svg.append("defs").append("clipPath").attr("id","time-clip").append("rect").attr("x",0).attr("y",top).attr("width",W).attr("height",H-top-bottom);
    this.svg.selectAll(".column-title").data(["Era","System","Series"]).join("text").attr("class","column-title").attr("x",(_,i)=>starts[i]+widths[i]/2).attr("y",15).attr("text-anchor","middle").text(d=>d);
    const visible=this.rows.filter(d=>y(d.older)>=top-20&&y(d.younger)<=H+20),g=this.svg.append("g").attr("clip-path","url(#time-clip)").selectAll("g").data(visible).join("g");
    g.append("rect").attr("class","cell").attr("x",d=>starts[ranks.indexOf(d.rank)]).attr("y",d=>y(d.younger)).attr("width",d=>widths[ranks.indexOf(d.rank)]).attr("height",d=>Math.max(.8,y(d.older)-y(d.younger))).attr("fill",d=>d.color).on("click",(event,d)=>{
      event.stopPropagation();let seriesName=d.rank==="Age"?d.parent:d.name;let ids=this.rows.filter(r=>r.rank==="Epoch"&&(d.rank==="Era"?r.era===d.name:d.rank==="Period"?r.periodKey===d.name:r.name===seriesName)).map(r=>r.id);if(!ids.length)ids=[d.id];this.selection.select(ids,event.ctrlKey||event.metaKey);
    });
    g.filter(d=>y(d.older)-y(d.younger)>17).append("text").attr("class",d=>`cell-label${dark(d.color)?" light-label":""}`).attr("x",d=>starts[ranks.indexOf(d.rank)]+widths[ranks.indexOf(d.rank)]/2).attr("y",d=>(y(d.older)+y(d.younger))/2+5).attr("text-anchor","middle").attr("transform",d=>d.rank==="Era"?`rotate(-90 ${starts[0]+widths[0]/2} ${(y(d.older)+y(d.younger))/2})`:null).text(d=>d.rank==="Era"?d.name:(d.name.length>17?d.name.slice(0,15)+"…":d.name));
    this.svg.append("g").attr("class","age-axis").attr("transform",`translate(${W-right+3},0)`).call(d3.axisRight(y).ticks(9).tickFormat(d=>`${d} Ma`).tickSize(3));
    this.svg.on("click",()=>this.selection.clear());
  }
}

function dark(color:string):boolean{const value=color.replace('#','');if(value.length!==6)return false;const r=parseInt(value.slice(0,2),16),g=parseInt(value.slice(2,4),16),b=parseInt(value.slice(4,6),16);return (.299*r+.587*g+.114*b)<135;}
