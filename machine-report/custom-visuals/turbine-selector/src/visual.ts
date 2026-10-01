import powerbi from "powerbi-visuals-api";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "../style/visual.css";
import { readSelectorSettings, selectorDefaults, selectorFormattingModel, SelectorSettings } from "./settings";

interface PartRow{
  key:string;name:string;status:string;temperature?:number;vibration?:number;uptime?:number;health?:number;selectionId:powerbi.visuals.ISelectionId;
}

export class Visual implements powerbi.extensibility.visual.IVisual{
  private host:powerbi.extensibility.visual.IVisualHost;
  private selectionManager:powerbi.extensibility.ISelectionManager;
  private root:HTMLDivElement;
  private sceneHost:HTMLDivElement;
  private heading:HTMLDivElement;
  private headingText:HTMLElement;
  private controlsElement:HTMLDivElement;
  private binding:HTMLDivElement;
  private tooltip:HTMLDivElement;
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(32,1,.1,100);
  private controls:OrbitControls;
  private machine=new THREE.Group();
  private parts=new Map<string,THREE.Group>();
  private rows=new Map<string,PartRow>();
  private pickable:THREE.Mesh[]=[];
  private rotators:THREE.Group[]=[];
  private raycaster=new THREE.Raycaster();
  private pointer=new THREE.Vector2();
  private frame=0;
  private lastTime=performance.now();
  private hoveredKey:string|null=null;
  private selectedKey:string|null=null;
  private downPoint:{x:number;y:number}|null=null;
  private exploded=false;
  private motion=true;
  private settings:SelectorSettings={...selectorDefaults};

  constructor(options?:powerbi.extensibility.visual.VisualConstructorOptions){
    if(!options)throw new Error("Power BI must supply visual constructor options.");
    this.host=options.host;
    this.selectionManager=this.host.createSelectionManager();
    this.root=document.createElement("div");this.root.className="turbine-root";
    this.sceneHost=document.createElement("div");this.sceneHost.className="scene";this.root.appendChild(this.sceneHost);
    this.heading=document.createElement("div");this.heading.className="heading";this.headingText=document.createElement("strong");this.headingText.textContent="Select a turbine";const headingSub=document.createElement("span");headingSub.textContent="Click an assembly to filter";this.heading.append(this.headingText,headingSub);this.root.appendChild(this.heading);
    this.controlsElement=document.createElement("div");this.controlsElement.className="controls";[{action:"reset",label:"Reset view"},{action:"explode",label:"Explode"},{action:"motion",label:"Motion on",active:true}].forEach(item=>{const button=document.createElement("button");button.type="button";button.dataset.action=item.action;button.textContent=item.label;if(item.active)button.classList.add("active");this.controlsElement.appendChild(button);});this.root.appendChild(this.controlsElement);
    const hint=document.createElement("div");hint.className="hint";hint.textContent="Drag to orbit · Right-drag to pan · Scroll to zoom · Click to filter";this.root.appendChild(hint);
    this.binding=document.createElement("div");this.binding.className="binding";this.binding.textContent="Add Part key to enable report filtering";this.root.appendChild(this.binding);
    this.tooltip=document.createElement("div");this.tooltip.className="tooltip";this.tooltip.setAttribute("role","tooltip");this.root.appendChild(this.tooltip);
    options.element.appendChild(this.root);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance"});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.26;
    this.sceneHost.appendChild(this.renderer.domElement);
    this.camera.position.set(9.8,6.2,11.4);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(0,.15,0);this.controls.enableDamping=true;this.controls.dampingFactor=.075;this.controls.minDistance=7;this.controls.maxDistance=32;this.controls.maxPolarAngle=Math.PI*.84;this.controls.saveState();
    this.buildScene();this.bindEvents();
    this.selectionManager.registerOnSelectCallback(ids=>{this.selectedKey=null;for(const [key,row] of this.rows){if(ids.some(id=>(id as powerbi.visuals.ISelectionId).equals(row.selectionId))){this.selectedKey=key;break;}}this.updateMaterials();});
    this.animate();
  }

  public update(options:powerbi.extensibility.visual.VisualUpdateOptions):void{
    const view=options.dataViews?.[0];this.settings=readSelectorSettings(view);this.motion=this.settings.motion;
    this.root.style.setProperty("--visual-bg",this.settings.backgroundColor);this.root.style.setProperty("--heading-size",`${this.settings.headingSize}px`);this.root.style.setProperty("--subtitle-size",`${this.settings.subtitleSize}px`);this.root.style.setProperty("--control-size",`${this.settings.controlSize}px`);this.root.style.setProperty("--hint-size",`${this.settings.hintSize}px`);this.root.style.setProperty("--binding-size",`${this.settings.bindingSize}px`);this.root.style.setProperty("--tooltip-title-size",`${this.settings.tooltipTitleSize}px`);this.root.style.setProperty("--tooltip-body-size",`${this.settings.tooltipBodySize}px`);this.root.style.padding=`${this.settings.padding}px`;this.heading.style.display=this.settings.showHeading?"block":"none";this.controlsElement.style.display=this.settings.showControls?"flex":"none";
    this.readData(view?.table);
    const width=Math.max(120,options.viewport.width-this.settings.padding*2),height=Math.max(120,options.viewport.height-this.settings.padding*2);this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    this.updateMaterials();
  }

  public getFormattingModel():powerbi.visuals.FormattingModel{return selectorFormattingModel(this.settings);}
  public destroy():void{cancelAnimationFrame(this.frame);this.controls.dispose();this.renderer.dispose();this.scene.traverse(obj=>{const mesh=obj as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();const material=(mesh as THREE.Mesh).material;if(Array.isArray(material))material.forEach(m=>m.dispose());else material?.dispose();});}

  private readData(table?:powerbi.DataViewTable):void{
    this.rows.clear();
    if(!table?.rows){this.headingText.textContent="Select a turbine";this.binding.style.display="block";return;}
    const index=(role:string)=>table.columns.findIndex(column=>Boolean(column.roles?.[role]));
    const machineIndex=index("machineId"),keyIndex=index("partKey"),nameIndex=index("partName"),statusIndex=index("status"),temperatureIndex=index("temperature"),vibrationIndex=index("vibration"),uptimeIndex=index("uptime"),healthIndex=index("health");
    const machineIds=machineIndex>=0?Array.from(new Set(table.rows.map(row=>String(row[machineIndex]??"").trim()).filter(Boolean))):[];
    this.headingText.textContent=machineIds.length===1?machineIds[0]:machineIds.length>1?"Multiple turbines":"Add Machine ID";
    if(keyIndex<0){this.binding.style.display="block";return;}
    table.rows.forEach((row,rowIndex)=>{
      const raw=String(row[keyIndex]??"");const key=this.modelKey(raw);if(!key)return;
      this.rows.set(key,{key,name:nameIndex>=0?String(row[nameIndex]??raw):raw,status:statusIndex>=0?String(row[statusIndex]??"Normal"):"Normal",temperature:this.number(row[temperatureIndex]),vibration:this.number(row[vibrationIndex]),uptime:this.number(row[uptimeIndex]),health:this.number(row[healthIndex]),selectionId:this.host.createSelectionIdBuilder().withTable(table,rowIndex).createSelectionId()});
    });
    this.binding.style.display=this.rows.size?"none":"block";
  }

  private modelKey(value:string):string{
    const key=value.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    const aliases:Record<string,string>={"air-inlet":"inlet","inlet-fan":"fan","axial-compressor":"compressor","high-pressure-turbine":"hp-turbine","low-pressure-turbine":"lp-turbine","exhaust-diffuser":"exhaust","main-shaft":"shaft"};
    return aliases[key]||key;
  }
  private number(value:powerbi.PrimitiveValue|undefined):number|undefined{const n=Number(value);return Number.isFinite(n)?n:undefined;}

  private buildScene():void{
    this.scene.fog=new THREE.Fog(0x05090d,34,68);this.scene.add(new THREE.HemisphereLight(0xbffff9,0x10242b,3.1));this.scene.add(new THREE.AmbientLight(0x8fe8e1,1.15));
    const key=new THREE.DirectionalLight(0xe7ffff,4.35);key.position.set(-5,9,8);key.castShadow=true;this.scene.add(key);const rim=new THREE.DirectionalLight(0x20e6d6,4.1);rim.position.set(7,3,-7);this.scene.add(rim);const left=new THREE.DirectionalLight(0x74eee6,2.75);left.position.set(-9,2,6);this.scene.add(left);const right=new THREE.DirectionalLight(0xa5d7ff,2.1);right.position.set(9,4,5);this.scene.add(right);const warm=new THREE.PointLight(0xff7b35,34,11,2);warm.position.set(.8,1.2,1.5);this.scene.add(warm);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(38,26),new THREE.ShadowMaterial({color:0x000000,opacity:.42}));floor.rotation.x=-Math.PI/2;floor.position.y=-3.15;floor.receiveShadow=true;this.scene.add(floor);const grid=new THREE.GridHelper(24,24,0x24777a,0x17343a);grid.position.y=-3.13;(grid.material as THREE.Material).opacity=.24;(grid.material as THREE.Material).transparent=true;this.scene.add(grid);
    this.scene.add(this.machine);this.machine.rotation.y=-.08;
    const inlet=this.addPart("inlet",-5.1);this.addMesh(inlet,this.cylinderX(2.38,2.02,1.15,40,true,.42,Math.PI*1.32),this.material(0x6faaa7,.55,.3));this.addMesh(inlet,this.ringX(2.18,.12),this.material(0x32a49d,.7,.25),[-.57,0,0]);
    for(let i=0;i<5;i++){const a=(-.62+i*.31)*Math.PI;this.addMesh(inlet,new THREE.BoxGeometry(.7,.08,1.75),this.material(0x9bc9c4,.4,.4),[-.18,Math.cos(a)*.85,Math.sin(a)*.85],[a,0,0]);}
    const fan=this.addPart("fan",-3.88);this.bladeRing(fan,1.75,16,.22,1.55,.23,0x24aeb2,0,.3);this.addMesh(fan,this.ringX(1.9,.06),this.material(0x27d4c7,.75,.22));
    const compressor=this.addPart("compressor",-2.2);this.addMesh(compressor,this.cylinderX(1.72,1.98,2.25,40,true,.48,Math.PI*1.18),this.material(0x3e91a8,.58,.3,true,.72));for(let s=0;s<5;s++){const x=-.86+s*.42,r=1.52-s*.08;this.bladeRing(compressor,r,12,.09,.64,.12,s%2?0x9be4e7:0x4da9bd,x,s%2?-.22:.22);this.addMesh(compressor,this.ringX(r,.045,30),this.material(0xc3eff0,.45,.36),[x,0,0]);}
    const shaft=this.addPart("shaft",0);this.addMesh(shaft,this.cylinderX(.22,.22,9.1,24),this.material(0x55c9ff,.58,.22));
    const front=this.addPart("front-bearing",-.72);this.bearing(front,0x8a6db4);
    const combustor=this.addPart("combustor",.05);this.addMesh(combustor,this.cylinderX(1.75,1.6,1.95,40,true,.5,Math.PI*1.12),this.material(0xa9573e,.42,.34,true,.48));for(let i=0;i<8;i++){const a=i/8*Math.PI*2;this.addMesh(combustor,this.cylinderX(.24,.31,1.3,18,true),this.material(i%2?0xe46338:0xff8248,.35,.4),[0,Math.cos(a)*1.08,Math.sin(a)*1.08]);}
    const hp=this.addPart("hp-turbine",1.52);this.addMesh(hp,this.cylinderX(1.58,1.4,1.03,36,true,.48,Math.PI*1.16),this.material(0xb58a35,.55,.3,true,.66));this.bladeRing(hp,1.28,14,.13,.66,.15,0xe0a330,-.25,.32);this.bladeRing(hp,1.18,12,.13,.6,.14,0xcf8528,.24,-.28);
    const lp=this.addPart("lp-turbine",2.82);this.addMesh(lp,this.cylinderX(1.45,1.62,1.28,36,true,.48,Math.PI*1.16),this.material(0xae9252,.52,.32,true,.66));this.bladeRing(lp,1.17,12,.13,.59,.14,0xe3bc61,-.32,.3);this.bladeRing(lp,1.3,14,.13,.65,.14,0xcaa04a,.31,-.26);
    const rear=this.addPart("rear-bearing",3.72);this.bearing(rear,0x9178b4);
    const exhaust=this.addPart("exhaust",4.72);this.addMesh(exhaust,this.cylinderX(1.64,2.08,1.82,40,true,.42,Math.PI*1.32),this.material(0xa69a95,.48,.35));this.addMesh(exhaust,this.ringX(1.9,.12),this.material(0x62d7ca,.62,.28),[.9,0,0]);
    this.parts.forEach(group=>group.traverse(obj=>{const mesh=obj as THREE.Mesh;if(!mesh.isMesh)return;const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,28),new THREE.LineBasicMaterial({color:0x7dfff4,transparent:true,opacity:.16}));edges.raycast=()=>{};mesh.add(edges);}));
  }

  private material(color:number,metalness=.55,roughness=.32,transparent=false,opacity=1):THREE.MeshStandardMaterial{return new THREE.MeshStandardMaterial({color,metalness,roughness,transparent,opacity,side:THREE.DoubleSide});}
  private addPart(key:string,x:number):THREE.Group{const group=new THREE.Group();group.position.x=x;group.userData={partKey:key,homeX:x,homeY:0,homeZ:0};this.machine.add(group);this.parts.set(key,group);return group;}
  private addMesh(group:THREE.Group,geometry:THREE.BufferGeometry,material:THREE.MeshStandardMaterial,position=[0,0,0],rotation=[0,0,0]):THREE.Mesh{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(position[0],position[1],position[2]);mesh.rotation.set(rotation[0],rotation[1],rotation[2]);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={partKey:group.userData.partKey,baseColor:material.color.clone(),baseOpacity:material.opacity,baseTransparent:material.transparent};group.add(mesh);this.pickable.push(mesh);return mesh;}
  private cylinderX(top:number,bottom:number,length:number,segments=32,open=false,start=0,arc=Math.PI*2):THREE.CylinderGeometry{const geometry=new THREE.CylinderGeometry(top,bottom,length,segments,1,open,start,arc);geometry.rotateZ(Math.PI/2);return geometry;}
  private ringX(radius:number,tube=.08,segments=32):THREE.TorusGeometry{const geometry=new THREE.TorusGeometry(radius,tube,8,segments);geometry.rotateY(Math.PI/2);return geometry;}
  private bladeRing(group:THREE.Group,radius:number,count:number,width:number,height:number,depth:number,color:number,x:number,twist:number):void{const rotor=new THREE.Group();rotor.position.x=x;group.add(rotor);const material=this.material(color,.62,.25);this.addMesh(group,this.cylinderX(radius*.24,radius*.24,width,24),material,[x,0,0]);for(let i=0;i<count;i++){const a=i/count*Math.PI*2,blade=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);blade.position.set(0,Math.cos(a)*radius*.68,Math.sin(a)*radius*.68);blade.rotation.x=a+twist;blade.rotation.z=twist*.6;blade.castShadow=true;blade.userData={partKey:group.userData.partKey,baseColor:material.color.clone(),baseOpacity:material.opacity,baseTransparent:material.transparent};rotor.add(blade);this.pickable.push(blade);}this.rotators.push(rotor);}
  private bearing(group:THREE.Group,color:number):void{this.addMesh(group,this.ringX(.52,.19,28),this.material(color,.7,.25));this.addMesh(group,this.ringX(.82,.08),this.material(0xc2aee0,.5,.3));for(let i=0;i<10;i++){const a=i/10*Math.PI*2;this.addMesh(group,new THREE.SphereGeometry(.1,12,8),this.material(0xe2d9ec,.72,.18),[0,Math.cos(a)*.66,Math.sin(a)*.66]);}}

  private bindEvents():void{
    this.renderer.domElement.addEventListener("pointerdown",event=>this.downPoint={x:event.clientX,y:event.clientY});
    this.renderer.domElement.addEventListener("pointerup",event=>{if(!this.downPoint)return;const moved=Math.hypot(event.clientX-this.downPoint.x,event.clientY-this.downPoint.y);this.downPoint=null;if(moved<5)this.select(this.hit(event),event.ctrlKey||event.metaKey);});
    this.renderer.domElement.addEventListener("pointermove",event=>{const key=this.hit(event);if(key!==this.hoveredKey){this.hoveredKey=key;this.updateMaterials();}if(key){const row=this.rows.get(key),title=document.createElement("strong"),detail=document.createTextNode(row?`${row.status}${row.temperature!==undefined?` · ${row.temperature.toFixed(0)}°C`:""}${row.vibration!==undefined?` · ${row.vibration.toFixed(1)} mm/s`:""}`:"Click to select");title.textContent=row?.name||this.label(key);this.tooltip.replaceChildren(title,detail);this.tooltip.style.opacity="1";this.tooltip.style.left=`${event.clientX}px`;this.tooltip.style.top=`${event.clientY}px`;}else this.tooltip.style.opacity="0";});
    this.renderer.domElement.addEventListener("pointerleave",()=>{this.hoveredKey=null;this.tooltip.style.opacity="0";this.updateMaterials();});
    this.controlsElement.addEventListener("click",event=>{const button=(event.target as HTMLElement).closest("button") as HTMLButtonElement|null;if(!button)return;const action=button.dataset.action;if(action==="reset"){this.controls.reset();void this.selectionManager.clear();this.selectedKey=null;this.updateMaterials();}if(action==="explode"){this.exploded=!this.exploded;button.classList.toggle("active",this.exploded);const direction=this.camera.position.clone().sub(this.controls.target).normalize();this.camera.position.copy(this.controls.target).add(direction.multiplyScalar(this.exploded?27.5:16.5));}if(action==="motion"){this.motion=!this.motion;button.classList.toggle("active",this.motion);button.textContent=this.motion?"Motion on":"Motion off";}});
  }
  private hit(event:PointerEvent):string|null{const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.x=(event.clientX-rect.left)/rect.width*2-1;this.pointer.y=-(event.clientY-rect.top)/rect.height*2+1;this.raycaster.setFromCamera(this.pointer,this.camera);return this.raycaster.intersectObjects(this.pickable,false)[0]?.object.userData.partKey||null;}
  private select(key:string|null,multi:boolean):void{if(!key){void this.selectionManager.clear();this.selectedKey=null;this.updateMaterials();return;}const row=this.rows.get(key);if(this.selectedKey===key&&!multi){void this.selectionManager.clear();this.selectedKey=null;this.updateMaterials();return;}this.selectedKey=key;this.updateMaterials();if(row)void this.selectionManager.select(row.selectionId,multi);}
  private label(key:string):string{return key.split("-").map(word=>word[0].toUpperCase()+word.slice(1)).join(" ");}
  private updateMaterials():void{const selectedColor=new THREE.Color(this.settings.selectedColor);this.parts.forEach((group,key)=>group.traverse(obj=>{const mesh=obj as THREE.Mesh,material=mesh.material as THREE.MeshStandardMaterial;if(!mesh.isMesh||!material?.color)return;const active=key===this.selectedKey,hover=key===this.hoveredKey;material.color.copy(mesh.userData.baseColor||material.color);material.emissive?.copy(active?selectedColor:hover?new THREE.Color(0x174f50):new THREE.Color(0));material.emissiveIntensity=active ? .72 : hover ? .38 : 0;const base=mesh.userData.baseOpacity??1;material.transparent=this.selectedKey&&!active?true:(mesh.userData.baseTransparent??false);material.opacity=this.selectedKey&&!active?Math.min(base,.2):base;}));}
  private animate=():void=>{this.frame=requestAnimationFrame(this.animate);const now=performance.now(),dt=Math.min((now-this.lastTime)/1000,.04);this.lastTime=now;if(this.motion)this.rotators.forEach((rotor,index)=>rotor.rotation.x+=dt*(index<2?1.25:.8));const offsets:Record<string,[number,number,number]>={inlet:[-3.3,.15,0],fan:[-2.45,.05,0],compressor:[-1.55,0,0],"front-bearing":[-.72,.85,.25],combustor:[-.25,-.12,0],"hp-turbine":[.85,.08,0],"lp-turbine":[1.75,.02,0],"rear-bearing":[2.48,.8,.25],exhaust:[3.45,.12,0],shaft:[0,-2.22,.15]};this.parts.forEach((group,key)=>{const offset=offsets[key]||[0,0,0],factor=this.exploded?1:0;group.position.x=THREE.MathUtils.lerp(group.position.x,group.userData.homeX+offset[0]*factor,.075);group.position.y=THREE.MathUtils.lerp(group.position.y,offset[1]*factor,.075);group.position.z=THREE.MathUtils.lerp(group.position.z,offset[2]*factor,.075);});this.controls.update();this.renderer.render(this.scene,this.camera);};
}
