import {
    select,
    scaleUtc,
    scaleLinear,
    extent,
    axisBottom,
    axisLeft,
    line,
    utcFormat
} from "d3";
import type { ChartData, Point } from "./data";
import type { LineSettings } from "./settings";

/**
 * Draw a line chart inside an existing SVG element.
 *
 * Power BI's update() calls this function with data, settings, and viewport size.
 * The points have already been sorted by date in data.ts. A null value means
 * a missing reading, not zero. This function only needs SVG and D3 knowledge.
 *
 * Reading D3 chains: most methods return a selection so the next method can
 * operate on it. append() returns the newly created child selection instead.
 * attr("x", 10) sets a constant; attr("x", point => ...) computes one per datum.
 * SVG attributes such as stroke, cx, and transform are browser features;
 * D3's attr() method simply sets them.
 */
export function renderChart(
    svgElement: SVGSVGElement,
    data: ChartData,
    settings: LineSettings,
    width: number,
    height: number
): void {
    // 1. Prepare the drawing surface.
    // select() wraps the existing DOM element in a D3 selection.
    // width/height set its displayed size; viewBox defines its coordinate system.
    // The matching dimensions let us work directly in pixels.
    // select: https://d3js.org/d3-selection/selecting#select
    // attr:   https://d3js.org/d3-selection/modifying#selection_attr
    const svg = select(svgElement)
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", `${data.valueLabel} over time. ${data.message ?? ""}`);

    // Clear the previous drawing on every update, keeping the SVG itself.
    // This simple full redraw is sufficient for this small teaching example.
    // selectAll: https://d3js.org/d3-selection/selecting#selection_selectAll
    // remove:    https://d3js.org/d3-selection/modifying#selection_remove
    svg.selectAll("*").remove();

    // An SVG title describes the whole chart; it is not a visible chart heading.
    // append() creates a child element; text() sets its text content.
    // append: https://d3js.org/d3-selection/modifying#selection_append
    // text:   https://d3js.org/d3-selection/modifying#selection_text
    svg.append("title").text(`${data.valueLabel} over time`);

    // Show a helpful message instead of attempting to draw missing data or
    // squeezing axes into a viewport too small to read. text-anchor centers text.
    const isTooSmall = width < 240 || height < 180;
    if (data.message || isTooSmall) {
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#59636b")
            .attr("font-size", 12)
            .text(data.message ?? "Enlarge the visual to see the chart.");
        return;
    }

    // 2. Reserve margins for the value label and axis labels.
    // The plot dimensions exclude those margins; scales use this inner area.
    const margin = { top: 36, right: 24, bottom: 42, left: 62 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    // Only numeric readings determine the vertical bounds. Keep the original
    // points (including nulls) for the line so missing readings still create gaps.
    const numericPoints = data.points.filter(point => point.value !== null);
    if (numericPoints.length === 0) return;

    // 3. Find the data bounds.
    // extent() returns [minimum, maximum]; its callback chooses what to compare.
    // These tuple assertions tell TypeScript the bounds exist: data.ts provides
    // valid dates/finite numbers, and the nonempty guard above has already passed.
    // extent: https://d3js.org/d3-array/summarize#extent
    let [firstDate, lastDate] = extent(data.points, point => point.date) as [Date, Date];

    // A single date needs a nonzero domain. Expand one day on each side so its
    // point appears in the middle. getTime() expresses dates as milliseconds.
    if (firstDate.getTime() === lastDate.getTime()) {
        const oneDayInMilliseconds = 24 * 60 * 60 * 1000;
        firstDate = new Date(firstDate.getTime() - oneDayInMilliseconds);
        lastDate = new Date(lastDate.getTime() + oneDayInMilliseconds);
    }

    // The ! is a TypeScript non-null assertion, not a conversion. It is safe
    // here because numericPoints was filtered to exclude null readings.
    const [minimumValue, maximumValue] = extent(
        numericPoints,
        point => point.value!
    ) as [number, number];

    // Give the line some vertical breathing room. Constant readings also need
    // a nonzero domain; use 5% of their magnitude, with at least one unit.
    // The value axis fits the readings; it does not necessarily start at zero.
    const valuePadding = minimumValue === maximumValue
        ? Math.max(Math.abs(minimumValue) * 0.05, 1)
        : (maximumValue - minimumValue) * 0.12;

    // 4. Create functions that translate data values into pixel coordinates.
    // A domain is the input interval; a range is the output interval.
    // UTC makes date tick placement independent of the viewer's local timezone.
    // scaleUtc/domain/range: https://d3js.org/d3-scale/time
    const xScale = scaleUtc()
        .domain([firstDate, lastDate])
        .range([0, plotWidth]);

    // SVG y coordinates increase DOWNWARD. Reversing the range makes larger
    // values appear higher. nice() expands the domain to convenient round bounds.
    // scaleLinear/domain/range/nice: https://d3js.org/d3-scale/linear
    const yScale = scaleLinear()
        .domain([minimumValue - valuePadding, maximumValue + valuePadding])
        .nice()
        .range([plotHeight, 0]);

    // An SVG <g> groups elements. Moving this group by the margins lets all
    // children use coordinates relative to the top-left corner of the plot.
    const plot = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // 5. Draw the grid and axes.
    // Tick counts are hints: D3 chooses sensible intervals near these counts.
    const yTickCount = Math.max(2, Math.floor(plotHeight / 55));
    const xTickCount = Math.max(2, Math.floor(plotWidth / 100));

    // A left axis can double as a horizontal grid: negative tick lengths extend
    // rightward across the plot, and empty tick labels leave only the lines.
    // axisLeft/ticks/tickSize/tickFormat: https://d3js.org/d3-axis
    const gridAxis = axisLeft(yScale)
        .ticks(yTickCount)
        .tickSize(-plotWidth)
        .tickFormat(() => "");

    const grid = plot.append("g").attr("class", "grid");

    // call() passes this selection to the axis generator, which creates the SVG
    // tick groups, lines, and labels. Merely constructing an axis does not draw it.
    // call: https://d3js.org/d3-selection/control-flow#selection_call
    grid.call(gridAxis);

    // D3 gives the axis baseline path the class "domain". Removing that SVG
    // element does NOT change the scale's domain. Style the remaining grid lines.
    // select: https://d3js.org/d3-selection/selecting#selection_select
    grid.select(".domain").remove();
    grid.selectAll("line").attr("stroke", "#e6e9eb");

    // Place the date axis at the bottom of the plot. tickSizeOuter(0) removes
    // the small end caps of its baseline, leaving the ordinary ticks intact.
    // axisBottom/tickSizeOuter: https://d3js.org/d3-axis
    const dateAxis = axisBottom(xScale)
        .ticks(xTickCount)
        .tickSizeOuter(0);

    plot.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${plotHeight})`)
        .call(dateAxis);

    // The value axis stays at x = 0. Hide its tick marks and baseline; its labels
    // remain, with a ten-pixel gap from the plot edge.
    // tickSize/tickPadding: https://d3js.org/d3-axis
    const valueAxis = axisLeft(yScale)
        .ticks(yTickCount)
        .tickSize(0)
        .tickPadding(10);

    const valueAxisGroup = plot.append("g").attr("class", "axis");
    valueAxisGroup.call(valueAxis);
    valueAxisGroup.select(".domain").remove();

    // Both label axes share a muted color and font size. D3's axes use
    // currentColor for strokes/text, so the SVG color attribute styles them.
    plot.selectAll(".axis")
        .attr("color", "#657078")
        .attr("font-size", 11);

    // Draw the measure name in the top margin using the outer SVG coordinates.
    svg.append("text")
        .attr("x", margin.left)
        .attr("y", 18)
        .attr("fill", "#374149")
        .attr("font-size", 12)
        .attr("font-weight", 600)
        .text(data.valueLabel);

    // 6. Turn the array of points into one SVG path.
    // line<Point>() creates a generator; Point is its TypeScript input type.
    // defined() breaks the line at null readings. D3 only evaluates x/y for
    // defined points, which makes the value! assertion safe in the y callback.
    // The default curve connects readings with straight segments.
    // line/defined/x/y: https://d3js.org/d3-shape/line
    const lineGenerator = line<Point>()
        .defined(point => point.value !== null)
        .x(point => xScale(point.date))
        .y(point => yScale(point.value!));

    // datum() attaches the ENTIRE array to ONE path. attr("d", lineGenerator)
    // calls the generator with that array to produce SVG drawing instructions.
    // No fill means we draw only a stroke, not a filled area below the line.
    // datum: https://d3js.org/d3-selection/joining#selection_datum
    plot.append("path")
        .datum(data.points)
        .attr("class", "data-line")
        .attr("d", lineGenerator)
        .attr("fill", "none")
        .attr("stroke", settings.color)
        .attr("stroke-width", settings.width)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round");

    // 7. Draw optional point markers.
    // An isolated reading has no adjacent non-null reading to connect to.
    // Keep its marker even when Show points is off; otherwise it would disappear.
    // filter() here is the ordinary JavaScript array method, not a D3 selection.
    const markerPoints = data.points.filter((point, index, points) => {
        if (point.value === null) return false;
        if (settings.showPoints) return true;

        const hasPreviousReading = index > 0 && points[index - 1].value !== null;
        const hasNextReading = index < points.length - 1 && points[index + 1].value !== null;
        return !hasPreviousReading && !hasNextReading;
    });

    // In contrast to datum(), data() assigns ONE array item per element.
    // join("circle") creates missing circles, keeps existing ones, and removes
    // extras. Since we cleared the SVG above, all circles are new on this render.
    // cx/cy set the circle center; r is the radius in pixels.
    // data/join: https://d3js.org/d3-selection/joining
    const markers = plot.selectAll("circle")
        .data(markerPoints)
        .join("circle")
        .attr("class", "data-point")
        .attr("cx", point => xScale(point.date))
        .attr("cy", point => yScale(point.value!))
        .attr("r", 3.5)
        .attr("fill", settings.color)
        .attr("stroke", "white")
        .attr("stroke-width", 1.5);

    // utcFormat() returns a date-formatting function: %b = abbreviated month,
    // %d = two-digit day, %Y = four-digit year. Use UTC to match the x scale.
    // A child <title> inherits its circle's datum and provides a basic browser
    // hover tooltip. This is not Power BI's host tooltip service.
    // utcFormat: https://d3js.org/d3-time-format#utcFormat
    const formatDate = utcFormat("%b %d, %Y");
    markers.append("title")
        .text(point => `${formatDate(point.date)}: ${point.value}`);
}
