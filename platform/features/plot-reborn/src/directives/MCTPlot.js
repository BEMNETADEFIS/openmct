/*global define,window*/

define(
    [
        '../lib/utils'
    ],
    function (utils) {
        "use strict";

        var RANGE_TICK_COUNT = 7,
            DOMAIN_TICK_COUNT = 5,
            ZOOM_AMT = 0.02,
            PINCH_DRAG_AMT = 2;

        function MCTPlot() {

            function link($scope, $element) {
                // Now that we're here, let's handle some scope management that the controller would otherwise handle.

                if (typeof $scope.rectangles === "undefined") {
                    $scope.rectangles = [];
                }
                if (typeof $scope.displayableRange === "undefined") {
                    $scope.displayableRange = function (x) { return x; };
                }
                if (typeof $scope.displayableDomain === "undefined") {
                    $scope.displayableDomain = function (x) { return x; };
                }
                if (typeof $scope.axes === "undefined") {
                    $scope.axes = {
                        domain: {
                            label: "Time",
                            tickCount: DOMAIN_TICK_COUNT,
                            ticks: []
                        },
                        range: {
                            label: "Value",
                            tickCount: RANGE_TICK_COUNT,
                            ticks: []
                        }
                    };
                }

                var dragStart,
                    marqueeBox = {},
                    marqueeRect, // Set when exists.
                    chartElementBounds,
                    firstTouches,
                    firstTouch,
                    firstTouchDistance,
                    lastTouchDistance,
                    $canvas = $element.find('canvas');

                function updateAxesForCurrentViewport() {
                    // Update axes definitions for current viewport.
                    ['domain', 'range'].forEach(function (axisName) {
                        var axis = $scope.axes[axisName],
                            firstTick = $scope.viewport.topLeft[axisName],
                            lastTick = $scope.viewport.bottomRight[axisName],
                            axisSize = firstTick - lastTick,
                            denominator = axis.tickCount - 1,
                            tickNumber,
                            tickIncrement,
                            tickValue;
                        // Yes, ticksize is negative for domain and positive for range.
                        // It's because ticks are generated/displayed top to bottom and left to right.
                        axis.ticks = [];
                        for (tickNumber = 0; tickNumber < axis.tickCount; tickNumber = tickNumber + 1) {
                            tickIncrement = (axisSize * (tickNumber / denominator));
                            tickValue = firstTick - tickIncrement;
                            axis.ticks.push(
                                tickValue
                            );
                        }
                    });
                }

                function drawMarquee() {
                    // Create rectangle for Marquee if it should be set.
                    if (marqueeBox && marqueeBox.start && marqueeBox.end) {
                        if (!marqueeRect) {
                            marqueeRect = {};
                            $scope.rectangles.push(marqueeRect);
                        }
                        marqueeRect.start = marqueeBox.start;
                        marqueeRect.end = marqueeBox.end;
                        marqueeRect.color = [1, 1, 1, 0.5];
                        marqueeRect.layer = 'top'; // TODO: implement this.
                        $scope.$broadcast('rectangle-change');
                    } else if (marqueeRect && $scope.rectangles.indexOf(marqueeRect) !== -1) {
                        $scope.rectangles.splice($scope.rectangles.indexOf(marqueeRect));
                        marqueeRect = undefined;
                        $scope.$broadcast('rectangle-change');
                    }
                }

                function untrackMousePosition() {
                    $scope.mouseCoordinates = undefined;
                }
                function updateMarquee() {
                    // Update the marquee box in progress.
                    marqueeBox.end = $scope.mouseCoordinates.positionAsPlotPoint;
                    drawMarquee();
                }
                function startMarquee() {
                    marqueeBox.start = $scope.mouseCoordinates.positionAsPlotPoint;
                }
                function endMarquee() {
                    // marqueeBox start/end are opposite corners but we need
                    // topLeft and bottomRight.
                    var boxPoints = utils.boxPointsFromOppositeCorners(marqueeBox.start, marqueeBox.end),
                        newViewport = utils.oppositeCornersFromBoxPoints(boxPoints);

                    marqueeBox = {};
                    drawMarquee();
                    $scope.$emit('user:viewport:change:end', newViewport);
                    $scope.viewport = newViewport;
                }

                function startDrag($event) {
                    $scope.$emit('user:viewport:change:start');
                    if (!$scope.mouseCoordinates) {
                        return;
                    }
                    $event.preventDefault();
                    // Track drag location relative to position over element
                    // not domain, as chart viewport will change as we drag.
                    dragStart = $scope.mouseCoordinates.positionAsPlotPoint;
                    // Tell controller that we're starting to navigate.
                    return false;
                }

                function updateDrag() {
                    // calculate offset between points.  Apply that offset to viewport.
                    var newPosition = $scope.mouseCoordinates.positionAsPlotPoint,
                        dDomain = dragStart.domain - newPosition.domain,
                        dRange = dragStart.range - newPosition.range;

                    $scope.viewport = {
                        topLeft: {
                            domain: $scope.viewport.topLeft.domain + dDomain,
                            range: $scope.viewport.topLeft.range + dRange
                        },
                        bottomRight: {
                            domain: $scope.viewport.bottomRight.domain + dDomain,
                            range: $scope.viewport.bottomRight.range + dRange
                        }
                    };
                }

                function endDrag() {
                    dragStart = undefined;
                    $scope.$emit('user:viewport:change:end', $scope.viewport);
                }
                
                function trackTouchPosition(touchPosition, bounds) {
                    var positionOverElement,
                        positionAsPlotPoint,
                        position;
                    
                    chartElementBounds = bounds;
                    
                    positionOverElement = {
                        x: touchPosition.clientX - bounds.left,
                        y: touchPosition.clientY - bounds.top
                    };
                    
                    positionAsPlotPoint = utils.elementPositionAsPlotPosition(
                        positionOverElement,
                        bounds,
                        $scope.viewport
                    );

                    position = {
                        positionOverElement: positionOverElement,
                        positionAsPlotPoint: positionAsPlotPoint
                    };
                    
                    return position;
                }

                function trackMousePosition($event) {
                    // Calculate coordinates of mouse related to canvas and as
                    // domain, range value and make available in scope for display.

                    var bounds = $event.target.getBoundingClientRect(),
                        positionOverElement,
                        positionAsPlotPoint;

                    chartElementBounds = bounds;

                    
                    positionOverElement = {
                        x: $event.clientX - bounds.left,
                        y: $event.clientY - bounds.top
                    };

                    positionAsPlotPoint = utils.elementPositionAsPlotPosition(
                        positionOverElement,
                        bounds,
                        $scope.viewport
                    );

                    $scope.mouseCoordinates = {
                        positionOverElement: positionOverElement,
                        positionAsPlotPoint: positionAsPlotPoint
                    };

                    if (marqueeBox && marqueeBox.start) {
                        updateMarquee();
                    }

                    if (dragStart) {
                        updateDrag();
                    }
                }

                function watchForMarquee() {
                    $canvas.removeClass('plot-drag');
                    $canvas.addClass('plot-marquee');
                    $canvas.on('mousedown', startMarquee);
                    $canvas.on('mouseup', endMarquee);
                    $canvas.off('mousedown', startDrag);
                    $canvas.off('mouseup', endDrag);
                }

                function watchForDrag() {
                    $canvas.addClass('plot-drag');
                    $canvas.removeClass('plot-marquee');
                    $canvas.on('mousedown', startDrag);
                    $canvas.on('mouseup', endDrag);
                    $canvas.off('mousedown', startMarquee);
                    $canvas.off('mouseup', endMarquee);
                }

                function toggleInteractionMode(event) {
                    if (event.keyCode === 16) { // shift key.
                        watchForDrag();
                    }
                }

                function resetInteractionMode(event) {
                    if (event.keyCode === 16) {
                        watchForMarquee();
                    }
                }

                function stopWatching() {
                    $canvas.off('mousedown', startDrag);
                    $canvas.off('mouseup', endDrag);
                    $canvas.off('mousedown', startMarquee);
                    $canvas.off('mouseup', endMarquee);
                    window.removeEventListener('keydown', toggleInteractionMode);
                    window.removeEventListener('keyup', resetInteractionMode);
                }

                $canvas.on('mousemove', trackMousePosition);
                $canvas.on('mouseleave', untrackMousePosition);
                watchForMarquee();

                window.addEventListener('keydown', toggleInteractionMode);
                window.addEventListener('keyup', resetInteractionMode);

                function onViewportChange() {
                    if ($scope.mouseCoordinates && chartElementBounds) {
                        $scope.mouseCoordinates.positionAsPlotPoint =
                            utils.elementPositionAsPlotPosition(
                                $scope.mouseCoordinates.positionOverElement,
                                chartElementBounds,
                                $scope.viewport
                            );
                    }
                    // TODO: Discuss whether marqueeBox start should be fixed to data or fixed to canvas element, especially when "isLive is true".
                    updateAxesForCurrentViewport();
                }

                function setDimensions(midpoint) {
                    return {
                        tl: {
                            domain: Math.abs(midpoint.domain - ($scope.viewport.topLeft.domain)),
                            range: Math.abs(midpoint.range - ($scope.viewport.topLeft.range))
                        },
                        br: {
                            domain: Math.abs(($scope.viewport.bottomRight.domain) - midpoint.domain),
                            range: Math.abs(($scope.viewport.bottomRight.range) - midpoint.range)
                        }
                    };
                }

                function calculateViewport(midpoint, ratio) {
                    var tl,
                        br,
                        dimensions = setDimensions(midpoint),
                        checkRatio = (ratio - 1) || 0,
                        type = (-1 * (checkRatio / Math.abs(checkRatio))) || 1;

                    tl = {
                        domain: type * ZOOM_AMT * dimensions.tl.domain,
                        range: type * ZOOM_AMT * dimensions.tl.range
                    };
                    br = {
                        domain: type * ZOOM_AMT * dimensions.br.domain,
                        range: type * ZOOM_AMT * dimensions.br.range
                    };

                    return {
                        topLeft: {
                            domain: (($scope.viewport.topLeft.domain) + tl.domain),
                            range: (($scope.viewport.topLeft.range) - tl.range)
                        },
                        bottomRight: {
                            domain: (($scope.viewport.bottomRight.domain) - br.domain),
                            range: (($scope.viewport.bottomRight.range) + br.range)
                        }
                    };
                }

                function updateZoom(midpoint, bounds, distance) {
                    // calculate offset between points.  Apply that offset to viewport.
                    var midpointPosition = trackTouchPosition(midpoint, bounds),
                        newMidpointPosition = midpointPosition.positionAsPlotPoint,
                        distanceRatio = (lastTouchDistance / distance) || (firstTouchDistance / distance),
                        newViewport = calculateViewport(newMidpointPosition, distanceRatio);

                    $scope.viewport = newViewport;
                }
                
                function startZoom(midpoint, bounds, touches, distance) {
                    firstTouches = [trackTouchPosition(touches[0], bounds).positionAsPlotPoint,
                                    trackTouchPosition(touches[1], bounds).positionAsPlotPoint];
                    firstTouchDistance = distance;
                    firstTouch = trackTouchPosition(midpoint, bounds).positionAsPlotPoint;
                }
                
                function updatePan(touch, bounds) {
                    // calculate offset between points.  Apply that offset to viewport.
                    var panPosition = trackTouchPosition(touch, bounds),
                        newPanPosition = panPosition.positionAsPlotPoint,
                        dDomain = firstTouch.domain - newPanPosition.domain,
                        dRange = firstTouch.range - newPanPosition.range;
                    
                    $scope.viewport = {
                        topLeft: {
                            domain: (($scope.viewport.topLeft.domain) + dDomain),
                            range: (($scope.viewport.topLeft.range) + dRange)
                        },
                        bottomRight: {
                            domain: (($scope.viewport.bottomRight.domain) + dDomain),
                            range: (($scope.viewport.bottomRight.range) + dRange)
                        }
                    };
                }
                
                function startPan(touch, bounds) {
                    $scope.$emit('user:viewport:change:start');
                    firstTouch = trackTouchPosition(touch, bounds).positionAsPlotPoint;
                }

                function endTouch() {
                    $scope.$emit('user:viewport:change:end', $scope.viewport);
                }

                function onPinchStart(event, touch) {
                    $scope.$emit('user:viewport:change:start');
                    startZoom(touch.midpoint, touch.bounds, touch.touches, touch.distance);
                }


                function comparePinchDrag(distance, firstDistance, lastDistance) {
                    return (((firstDistance + PINCH_DRAG_AMT) >= distance) &&
                        ((firstDistance - PINCH_DRAG_AMT) <= distance)) ||
                        (((lastDistance + PINCH_DRAG_AMT) >= distance) &&
                        ((lastDistance - PINCH_DRAG_AMT) <= distance));
                }

                function onPinchChange(event, touch) {
                    if(comparePinchDrag(Math.round(touch.distance),
                            Math.round(firstTouchDistance),
                            Math.round(lastTouchDistance))) {
                        //console.log("# PINCH PAN");
                        updatePan(touch.midpoint, touch.bounds);
                    } else {
                        //console.log("# PINCH ZOOM");
                        updateZoom(touch.midpoint, touch.bounds, touch.distance);
                    }
                    lastTouchDistance = touch.distance;
                }
                
                function onPanStart(event, touch) {
                    startPan(touch.touch, touch.bounds);
                }

                function onPanChange(event, touch) {
                    updatePan(touch.touch, touch.bounds);
                }

                function onTouchEnd() {
                    endTouch();
                }

                $scope.$watchCollection('viewport', onViewportChange);
                
                $scope.$on('mct:pan:start', onPanStart);
                $scope.$on('mct:pan:change', onPanChange);
                
                $scope.$on('mct:pinch:start', onPinchStart);
                $scope.$on('mct:pinch:change', onPinchChange);
                
                $scope.$on('mct:ptouch:end', onTouchEnd);
                
                $scope.$on('$destroy', stopWatching);
            }

            return {
                restrict: "E",
                templateUrl: 'platform/features/plot-reborn/res/templates/mct-plot.html',
                link: link,
                scope: {
                    viewport: "=",
                    series: "=",
                    rectangles: "=?",
                    axes: "=?",
                    displayableRange: "=?",
                    displayableDomain: "=?"
                }
            };
        }

        return MCTPlot;
    }
);