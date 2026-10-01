import type powerbi from "powerbi-visuals-api";

export interface Point { date: Date; value: number | null }
export interface ChartData { points: Point[]; valueLabel: string; message?: string }

// Power BI's categorical DataView becomes ordinary chart data.
export function readData(dataView?: powerbi.DataView): ChartData {
    const category = dataView?.categorical?.categories?.find(c => c.source.roles?.date);
    const measure = dataView?.categorical?.values?.find(v => v.source.roles?.value);
    if (!category || !measure) {
        return { points: [], valueLabel: "Value", message: "Add a Date field and a numeric Value." };
    }
    const points: Point[] = [];
    category.values.forEach((rawDate, index) => {
        // Reject nulls before conversion: new Date(null) would invent a 1970 date.
        if (!(rawDate instanceof Date) && typeof rawDate !== "string") return;
        const date = new Date(rawDate);
        if (!Number.isFinite(date.getTime())) return;
        const rawValue = measure.values[index];
        points.push({ date, value: typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null });
    });
    points.sort((a, b) => a.date.getTime() - b.date.getTime());
    return {
        points,
        valueLabel: measure.source.displayName,
        message: points.some(p => p.value !== null) ? undefined : "No numeric readings in this selection."
    };
}

