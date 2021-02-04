import { TickFormatter } from '@visx/axis';
import { localPoint } from '@visx/event';
import { Point } from '@visx/point';
import { scaleBand } from '@visx/scale';
import { bisectLeft } from 'd3-array';
import { ScaleTime } from 'd3-scale';
import { useCallback, useMemo, useState } from 'react';
import { isDefined } from 'ts-is-present';
import { Box } from '~/components-styled/base';
import { Legenda, LegendItem, LegendShape } from '~/components-styled/legenda';
import {
  ChartAxes,
  ChartPadding,
  ChartScales,
  ComponentCallbackFunction,
  defaultPadding,
} from '~/components-styled/line-chart/components';
import {
  isDateSeries,
  isDateSpanSeries,
  Value,
} from '~/components-styled/stacked-chart/logic';
import { Text } from '~/components-styled/typography';
import { ValueAnnotation } from '~/components-styled/value-annotation';
import text from '~/locale/index';
import { colors } from '~/style/theme';
import {
  formatDateFromMilliseconds,
  formatDateFromSeconds,
} from '~/utils/formatDate';
import { formatNumber, formatPercentage } from '~/utils/formatNumber';
import { TimeframeOption } from '~/utils/timeframe';
import { HoverPoint, Marker, Tooltip, Trend } from './components';
import { calculateYMax, getTrendData, TrendValue } from './logic';

const dateToValue = (d: Date) => d.valueOf() / 1000;
const formatXAxis = (date: Date) =>
  formatDateFromSeconds(dateToValue(date), 'axis');
const formatYAxisFn = (y: number) => formatNumber(y);
const formatYAxisPercentageFn = (y: number) => `${formatPercentage(y)}%`;

export type LineConfig<T extends Value> = {
  metricProperty: keyof T;
  color?: string;
  style?: 'solid' | 'dashed';
  areaFillOpacity?: number;
  strokeWidth?: number;
  legendLabel?: string;
  legendShape?: LegendShape;
};

export type LineChartProps<T extends Value> = {
  values: T[];
  linesConfig: LineConfig<T>[];
  width?: number;
  height?: number;
  timeframe?: TimeframeOption;
  signaalwaarde?: number;
  formatTooltip?: (value: (T & TrendValue)[]) => React.ReactNode;
  formatXAxis?: TickFormatter<Date>;
  formatYAxis?: TickFormatter<number>;
  hideFill?: boolean;
  valueAnnotation?: string;
  isPercentage?: boolean;
  showMarkerLine?: boolean;
  formatMarkerLabel?: (value: T) => string;
  padding?: Partial<ChartPadding>;
  showLegend?: boolean;
  legendItems?: LegendItem[];
  componentCallback?: ComponentCallbackFunction;
  ariaLabelledBy?: string;
};

export function LineChart<T extends Value>({
  values,
  linesConfig,
  width = 500,
  height = 250,
  /**
   * @TODO This is a weird default. The chart should show "all" by default
   * because you might not have a timeframe toggle as part of the chart. I'm
   * leaving this for later as I don't have time to break stuff now.
   */
  timeframe = '5weeks',
  signaalwaarde,
  formatTooltip,
  formatYAxis,
  hideFill = false,
  valueAnnotation,
  isPercentage,
  showMarkerLine = false,
  formatMarkerLabel,
  padding: overridePadding,
  showLegend = false,
  legendItems = showLegend
    ? linesConfig.map((x) => ({
        color: x.color ?? colors.data.primary,
        label: x.legendLabel ?? '',
        shape: x.legendShape ?? 'line',
      }))
    : undefined,
  componentCallback,
  ariaLabelledBy,
}: LineChartProps<T>) {
  const {
    tooltipData,
    tooltipLeft = 0,
    tooltipTop = 0,
    showTooltip,
    hideTooltip,
  } = useTooltip<T & TrendValue>();

  const metricProperties = useMemo(
    () => linesConfig.map((x) => x.metricProperty),
    [linesConfig]
  );

  const benchmark = useMemo(
    () =>
      signaalwaarde
        ? { value: signaalwaarde, label: text.common.barScale.signaalwaarde }
        : undefined,
    [signaalwaarde]
  );

  const [trendsList, xDomain] = useMemo(
    () => getTrendData(values, metricProperties as string[], timeframe),
    [values, metricProperties, timeframe]
  );

  const seriesMax = useMemo(() => calculateYMax(trendsList, signaalwaarde), [
    trendsList,
    signaalwaarde,
  ]);

  const yDomain = useMemo(() => [0, seriesMax], [seriesMax]);

  const padding: ChartPadding = useMemo(
    () => ({
      ...defaultPadding,
      // Increase space for larger numbers
      left: Math.max(seriesMax.toFixed(0).length * 10, defaultPadding.left),
      ...overridePadding,
    }),
    [overridePadding, seriesMax]
  );

  const timespanMarkerData = trendsList[0];

  const xMax = width - padding.left - padding.right;
  const yMax = height - padding.top - padding.bottom;

  function getDate(x: TrendValue) {
    return x.__date;
  }

  const dateSpanScale = useMemo(
    () =>
      scaleBand<Date>({
        range: [0, xMax],
        round: true,
        // domain: timespanMarkerData.map(getDate),
        domain: timespanMarkerData.map(getDate),
        padding: 0,
      }),
    [xMax, timespanMarkerData]
  );

  const [markerProps, setMarkerProps] = useState<{
    data: HoverPoint<T>[];
  }>();

  const bisect = useCallback(
    (
      trend: (TrendValue & Value)[],
      xPosition: number,
      xScale: ScaleTime<number, number>
    ) => {
      if (!trend.length) return;
      if (trend.length === 1) return trend[0];

      const date = xScale.invert(xPosition - padding.left);

      const index = bisectLeft(
        trend.map((x) => x.__date),
        date,
        1
      );

      const d0 = trend[index - 1];
      const d1 = trend[index];

      if (!d1) return d0;

      return +date - +d0.__date > +d1.__date - +date ? d1 : d0;
    },
    [padding]
  );

  const distance = (point1: HoverPoint<Value>, point2: Point) => {
    const x = point2.x - point1.x;
    const y = point2.y - point1.y;
    return Math.sqrt(x * x + y * y);
  };

  const toggleHoverElements = useCallback(
    (
      hide: boolean,
      hoverPoints?: HoverPoint<T>[],
      nearestPoint?: HoverPoint<T>
    ) => {
      if (hide) {
        hideTooltip();
        setMarkerProps(undefined);
      } else if (hoverPoints?.length && nearestPoint) {
        showTooltip({
          tooltipData: hoverPoints.map((x) => x.data),
          tooltipLeft: nearestPoint.x,
          tooltipTop: nearestPoint.y,
        });
        setMarkerProps({
          data: hoverPoints,
        });
      }
    },
    [showTooltip, hideTooltip]
  );

  const handleHover = useCallback(
    (
      event: React.TouchEvent<SVGElement> | React.MouseEvent<SVGElement>,
      scales: ChartScales
    ) => {
      /**
       * @TODO the hover handler is now passed the seriesIndex value (from
       * TimeseriesMarker). I think we can use this to greatly simplify the
       * logic below, since the index will tell us what slice of the trend
       * values is being hovered.
       *
       * In the case of 1 trend this gives us the point, and in the case of
       * multiple trends we only need to look at the y-position to find the
       * closest point in that slice.
       */
      if (!trendsList.length || event.type === 'mouseleave') {
        toggleHoverElements(true);
        return;
      }

      const { xScale, yScale } = scales;

      const point = localPoint(event);

      if (!point) {
        return;
      }

      const sortByNearest = (left: HoverPoint<T>, right: HoverPoint<T>) =>
        distance(left, point) - distance(right, point);

      const hoverPoints = trendsList
        .map((trends, index) => {
          const trendValue = bisect(trends, point.x, xScale);
          return trendValue
            ? {
                data: trendValue,
                color: linesConfig[index].color,
              }
            : undefined;
        })
        .filter(isDefined)
        .map<HoverPoint<T>>(
          ({ data, color }: { data: any; color?: string }) => {
            return {
              data,
              color,
              x: xScale(data.__date) ?? 0,
              y: yScale(data.__value) ?? 0,
            };
          }
        );
      const nearest = hoverPoints.slice().sort(sortByNearest);

      toggleHoverElements(false, hoverPoints, nearest[0]);
    },
    [bisect, trendsList, linesConfig, toggleHoverElements]
  );

  const renderTrendLines = useCallback(
    (x: ChartScales) => (
      <>
        {trendsList.map((trend, index) => (
          <Trend
            key={index}
            trend={trend}
            type={hideFill ? 'line' : 'area'}
            areaFillOpacity={linesConfig[index].areaFillOpacity}
            strokeWidth={linesConfig[index].strokeWidth}
            style={linesConfig[index].style}
            xScale={x.xScale}
            yScale={x.yScale}
            color={linesConfig[index].color}
            onHover={handleHover}
          />
        ))}
      </>
    ),
    [handleHover, linesConfig, hideFill, trendsList]
  );

  return (
    <Box>
      {valueAnnotation && (
        <ValueAnnotation mb={2}>{valueAnnotation}</ValueAnnotation>
      )}

      <Box position="relative">
        <ChartAxes
          padding={padding}
          height={height}
          width={width}
          xDomain={xDomain}
          yDomain={yDomain}
          formatYAxis={
            formatYAxis
              ? formatYAxis
              : isPercentage
              ? formatYAxisPercentageFn
              : formatYAxisFn
          }
          formatXAxis={formatXAxis}
          onHover={handleHover}
          benchmark={benchmark}
          componentCallback={componentCallback}
          ariaLabelledBy={ariaLabelledBy}
        >
          {renderTrendLines}
        </ChartAxes>

        {isDefined(tooltipData) && (
          <Tooltip
            bounds={{ right: width, left: 0, top: 0, bottom: height }}
            x={tooltipLeft + padding.left}
            y={tooltipTop + padding.top}
          >
            {formatTooltip
              ? formatTooltip(tooltipData)
              : formatDefaultTooltip(tooltipData, isPercentage)}
          </Tooltip>
        )}

        {/**
         * This is a clipping path for the date span marker because if we render
         * day values, then the first and last days will span pas the borders
         */}
        <Box
          height={yMax}
          width={xMax}
          // bg="rgba(1,0,0,0.1)"
          position="absolute"
          top={padding.top}
          left={padding.left}
          overflow="hidden"
          style={{
            pointerEvents: 'none',
          }}
        >
          {markerProps && (
            <Marker
              {...markerProps}
              showLine={showMarkerLine}
              formatLabel={formatMarkerLabel}
              dateSpanWidth={dateSpanScale.bandwidth()}
            />
          )}
        </Box>

        {showLegend && legendItems && (
          <Box pl={`${padding.left}px`}>
            <Legenda items={legendItems} />
          </Box>
        )}
      </Box>
    </Box>
  );
}

function formatDefaultTooltip<T extends Value>(
  values: (T & TrendValue)[],
  isPercentage?: boolean
) {
  // default tooltip assumes one line is rendered:

  if (isDateSeries(values)) {
    const value = values[0];
    return (
      <>
        <Text as="span" fontWeight="bold">
          {formatDateFromMilliseconds(value.__date.getTime()) + ': '}
        </Text>
        {isPercentage
          ? `${formatPercentage(value.__value)}%`
          : formatNumber(value.__value)}
      </>
    );
  } else if (isDateSpanSeries(values)) {
    const value = values[0];
    return (
      <>
        <Text as="span" fontWeight="bold">
          {formatDateFromSeconds(value.date_start_unix, 'short')} -{' '}
          {formatDateFromSeconds(value.date_end_unix, 'short')}:
        </Text>{' '}
        {isPercentage
          ? `${formatPercentage(value.__value)}%`
          : formatNumber(value.__value)}
      </>
    );
  }

  throw new Error(
    `Invalid value passed to format tooltip function: ${JSON.stringify(values)}`
  );
}

function useTooltip<T extends Value>() {
  const [tooltipData, setTooltipData] = useState<T[]>();
  const [tooltipLeft, setTooltipLeft] = useState<number>();
  const [tooltipTop, setTooltipTop] = useState<number>();

  const showTooltip = useCallback(
    (x: { tooltipData: T[]; tooltipLeft: number; tooltipTop: number }) => {
      setTooltipData(x.tooltipData);
      setTooltipLeft(x.tooltipLeft);
      setTooltipTop(x.tooltipTop);
    },
    []
  );

  const hideTooltip = useCallback(() => {
    setTooltipData(undefined);
    setTooltipLeft(undefined);
    setTooltipTop(undefined);
  }, []);

  return {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    showTooltip,
    hideTooltip,
  };
}