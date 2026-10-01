import type powerbi from "powerbi-visuals-api";

export interface LineSettings { color: string; width: number; showPoints: boolean }
export const defaults: LineSettings = { color: "#147D73", width: 2.5, showPoints: true };

export function readSettings(dataView?: powerbi.DataView): LineSettings {
    const line = dataView?.metadata.objects?.line;
    const fill = line?.color as powerbi.Fill | undefined;
    const color = fill?.solid?.color;
    const width = line?.width;
    return {
        color: typeof color === "string" ? color : defaults.color,
        width: typeof width === "number" && Number.isFinite(width) ? Math.max(1, Math.min(8, width)) : defaults.width,
        showPoints: typeof line?.showPoints === "boolean" ? line.showPoints : defaults.showPoints
    };
}

// descriptors match objects.line properties in capabilities.json.
export function formattingModel(settings: LineSettings): powerbi.visuals.FormattingModel {
    return { cards: [{
        uid: "line-card", displayName: "Line",
        groups: [{ uid: "line-group", displayName: "Appearance", slices: [
            { uid: "line-color", displayName: "Color", control: { type: "ColorPicker", properties: {
                descriptor: { objectName: "line", propertyName: "color" }, value: { value: settings.color }
            } } },
            { uid: "line-width", displayName: "Width (1–8 px)", control: { type: "NumUpDown", properties: {
                descriptor: { objectName: "line", propertyName: "width" }, value: settings.width
            } } },
            { uid: "line-points", displayName: "Show points", control: { type: "ToggleSwitch", properties: {
                descriptor: { objectName: "line", propertyName: "showPoints" }, value: settings.showPoints
            } } }
        ] }],
        revertToDefaultDescriptors: ["color", "width", "showPoints"].map(propertyName => ({ objectName: "line", propertyName }))
    }] };
}

