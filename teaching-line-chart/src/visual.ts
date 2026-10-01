import type powerbi from "powerbi-visuals-api";
import { readData } from "./data";
import { renderChart } from "./chart";
import { defaults, formattingModel, readSettings } from "./settings";
import "../style/visual.css";

export class Visual implements powerbi.extensibility.visual.IVisual {
    private svg: SVGSVGElement;
    private settings = { ...defaults };

    constructor(options?: powerbi.extensibility.visual.VisualConstructorOptions) {
        if (!options) throw new Error("Power BI must supply visual constructor options.");
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.classList.add("teaching-line-chart");
        options.element.appendChild(this.svg);
    }

    // Power BI calls update after field, filter, format, or viewport changes.
    public update(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        const dataView = options.dataViews?.[0];
        this.settings = readSettings(dataView);
        renderChart(this.svg, readData(dataView), this.settings, options.viewport.width, options.viewport.height);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return formattingModel(this.settings);
    }
}
